import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, mkdir, open, readFile, rm, stat } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough, Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import * as tar from 'tar';
import * as tarStream from 'tar-stream';
import { DataSource, QueryRunner } from 'typeorm';
import { AttachmentStorage } from '../attachments/attachment-storage.service';
import {
  extensionFor,
  MAX_ATTACHMENT_BYTES,
} from '../attachments/attachment-file.util';
import { withTenantExclusiveLock } from '../tenancy/tenant-operation-lock';
import { BackupConfigurationService } from './backup-configuration.service';

const OPERATION_LOCK = 1_984_114_993;
const MAGIC = Buffer.from('MEDERIB1');
const HEADER_BYTES = 40;
const MAC_BYTES = 32;
const RETENTION_DAYS = 30;
const SCHEDULE_HOUR = 2;
const SCHEDULE_MINUTE = 30;
const SCHEDULE_TIME_ZONE = 'Europe/Madrid';
const EXCLUDED_TENANT_TABLES = new Set([
  'iam.whatsapp_connection_routes', // Derived by a trigger from the connection table.
  'public.whatsapp_booking_sessions', // Ephemeral conversation state.
  'public.whatsapp_booking_receipts', // Ephemeral webhook idempotency state.
  'public.whatsapp_onboarding_attempts', // Expiring OAuth handshakes.
  'iam.backup_configuration',
  'iam.backup_runs',
  'iam.backup_artifacts',
  'iam.backup_restorations',
]);
const PRESERVED_ON_RESTORE = new Set(['public.whatsapp_booking_reminders']);

type TableId = { schema: string; name: string };
type JsonRow = Record<string, unknown>;
type Tenant = { id: string; name: string };
type AttachmentRef = {
  storage_key: string;
  size_bytes: number | string;
  mime_type: string;
};

interface SnapshotManifest {
  formatVersion: 1;
  tenant: JsonRow;
  createdAt: string;
  migrations: string[];
  tables: string[];
  attachments: Array<{
    storageKey: string;
    sizeBytes: number;
    archivePath: string;
  }>;
}

interface Snapshot {
  manifest: SnapshotManifest;
  tables: Record<string, JsonRow[]>;
}

export interface ArtifactRow {
  id: string;
  run_id: string;
  tenant_id: string;
  tenant_name: string;
  object_key: string;
  size_bytes: string | null;
  sha256: string | null;
  status: 'running' | 'succeeded' | 'failed';
  created_at: Date;
  error_summary: string | null;
  mode: 'manual' | 'daily' | 'pre_restore';
  run_status: 'running' | 'succeeded' | 'partial' | 'failed';
  started_at: Date;
  finished_at: Date | null;
  restored_at: Date | null;
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function tableKey(table: TableId): string {
  return `${table.schema}.${table.name}`;
}

function encodeJsonValue(value: unknown): unknown {
  if (Buffer.isBuffer(value))
    return { $mederiBinary: value.toString('base64') };
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(encodeJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        encodeJsonValue(nested),
      ]),
    );
  }
  return value;
}

function decodeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeJsonValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).length === 1 &&
      typeof record.$mederiBinary === 'string'
    ) {
      return Buffer.from(record.$mederiBinary, 'base64');
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, nested]) => [
        key,
        decodeJsonValue(nested),
      ]),
    );
  }
  return value;
}

function localDay(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHEDULE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function localHourAndMinute(date = new Date()): {
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SCHEDULE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return { hour: Number(values.hour), minute: Number(values.minute) };
}

@Injectable()
export class BackupsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupsService.name);
  private dailyTimer?: NodeJS.Timeout;
  private locallyRunning = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configuration: BackupConfigurationService,
    private readonly attachments: AttachmentStorage,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.dailyTimer = setInterval(() => {
      void this.runScheduledMaintenance().catch(() =>
        this.logger.error('No se pudo procesar la copia diaria.'),
      );
    }, 60_000);
    this.dailyTimer.unref();
    void this.runScheduledMaintenance().catch(() =>
      this.logger.error('No se pudo procesar la copia diaria.'),
    );
  }

  onModuleDestroy(): void {
    clearInterval(this.dailyTimer);
  }

  async list(): Promise<ArtifactRow[]> {
    return this.dataSource
      .query(`SELECT a.id, a.run_id, a.tenant_id, a.tenant_name, a.object_key,
        a.size_bytes, a.sha256, a.status, a.created_at, a.error_summary,
        r.mode, r.status AS run_status, r.started_at, r.finished_at,
        (SELECT max(x.finished_at) FROM iam.backup_restorations x
          WHERE x.artifact_id = a.id AND x.status = 'succeeded') AS restored_at
      FROM iam.backup_artifacts a JOIN iam.backup_runs r ON r.id = a.run_id
      ORDER BY a.created_at DESC LIMIT 500`) as Promise<ArtifactRow[]>;
  }

  async runNow(actorId: string) {
    return this.withOperationLock(async () => {
      const run = await this.createRun('manual', actorId);
      return this.runBackup(run.id, 'manual', actorId);
    });
  }

  async restore(artifactId: string, confirmation: string, actorId: string) {
    return this.withOperationLock(async () => {
      const [artifact] = (await this.dataSource.query(
        `SELECT id, tenant_id, tenant_name, object_key, size_bytes, sha256, status
         FROM iam.backup_artifacts WHERE id = $1`,
        [artifactId],
      )) as Array<
        Pick<
          ArtifactRow,
          | 'id'
          | 'tenant_id'
          | 'tenant_name'
          | 'object_key'
          | 'size_bytes'
          | 'sha256'
          | 'status'
        >
      >;
      if (!artifact || artifact.status !== 'succeeded' || !artifact.sha256) {
        throw new NotFoundException(
          'No se encuentra una copia válida para restaurar.',
        );
      }
      const [tenant] = (await this.dataSource.query(
        'SELECT id, name FROM iam.tenants WHERE id = $1',
        [artifact.tenant_id],
      )) as Tenant[];
      if (!tenant)
        throw new NotFoundException('La clínica de esa copia ya no existe.');
      if (confirmation.trim() !== artifact.tenant_name) {
        throw new BadRequestException(
          'Escribe el nombre de la clínica que aparece en la copia para confirmar la restauración.',
        );
      }

      return withTenantExclusiveLock(this.dataSource, tenant.id, async () => {
        const [restoration] = (await this.dataSource.query(
          `INSERT INTO iam.backup_restorations
           (artifact_id, tenant_id, tenant_name, status, actor_id)
         VALUES ($1, $2, $3, 'running', $4) RETURNING id`,
          [artifact.id, tenant.id, tenant.name, actorId],
        )) as Array<{ id: string }>;
        let safetyArtifactId: string | null = null;
        try {
          const safety = await this.createRun('pre_restore', actorId);
          const safetyResult = await this.runBackup(
            safety.id,
            'pre_restore',
            actorId,
            tenant.id,
          );
          if (safetyResult.successCount !== 1) {
            throw new BadRequestException(
              'No se pudo crear la copia previa; no se ha restaurado la clínica.',
            );
          }
          const [safetyArtifact] = (await this.dataSource.query(
            `SELECT id FROM iam.backup_artifacts WHERE run_id = $1 AND tenant_id = $2 AND status = 'succeeded'`,
            [safety.id, tenant.id],
          )) as Array<{ id: string }>;
          safetyArtifactId = safetyArtifact?.id ?? null;
          if (!safetyArtifactId)
            throw new BadRequestException(
              'No se pudo verificar la copia previa; no se ha restaurado la clínica.',
            );
          await this.restoreArtifact(artifact, tenant.id);
          await this.dataSource.query(
            `UPDATE iam.backup_restorations SET status = 'succeeded', finished_at = now(), safety_artifact_id = $2 WHERE id = $1`,
            [restoration.id, safetyArtifactId],
          );
          return {
            status: 'succeeded',
            tenantId: tenant.id,
            tenantName: tenant.name,
            safetyArtifactId,
          };
        } catch (error) {
          await this.dataSource.query(
            `UPDATE iam.backup_restorations SET status = 'failed', finished_at = now(), safety_artifact_id = $2,
             error_summary = 'No se ha completado la restauración' WHERE id = $1`,
            [restoration.id, safetyArtifactId],
          );
          throw error;
        }
      });
    });
  }

  private async runScheduledMaintenance(): Promise<void> {
    if (this.locallyRunning) return;
    try {
      await this.withOperationLock(async () => {
        await this.reconcileInterruptedOperations();
        await this.maybeRunDaily();
      });
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
    }
  }

  private async reconcileInterruptedOperations(): Promise<void> {
    const staleRuns = (await this.dataSource.query(
      `SELECT id, tenant_count FROM iam.backup_runs
       WHERE status = 'running' AND started_at < now() - interval '24 hours'`,
    )) as Array<{ id: string; tenant_count: number }>;

    for (const run of staleRuns) {
      await this.dataSource.query(
        `UPDATE iam.backup_artifacts
         SET status = 'failed', error_summary = 'La ejecución se interrumpió antes de terminar'
         WHERE run_id = $1 AND status = 'running'`,
        [run.id],
      );
      const [counts] = (await this.dataSource.query(
        `SELECT count(DISTINCT tenant_id) FILTER (WHERE status = 'succeeded')::integer AS success_count,
                count(DISTINCT tenant_id)::integer AS artifact_tenant_count
         FROM iam.backup_artifacts WHERE run_id = $1`,
        [run.id],
      )) as Array<{ success_count: number; artifact_tenant_count: number }>;
      const tenantCount = Math.max(
        Number(run.tenant_count),
        Number(counts.artifact_tenant_count),
      );
      const successCount = Number(counts.success_count);
      const status =
        tenantCount > 0 && successCount >= tenantCount
          ? 'succeeded'
          : successCount > 0
            ? 'partial'
            : 'failed';
      await this.dataSource.query(
        `UPDATE iam.backup_runs SET status = $2, finished_at = now(),
         tenant_count = $3::integer, success_count = $4::integer,
         error_summary = CASE WHEN $4::integer < $3::integer THEN 'Una o más clínicas no tienen una copia válida' ELSE NULL END
         WHERE id = $1 AND status = 'running'`,
        [run.id, status, tenantCount, successCount],
      );
    }

    await this.dataSource.query(
      `UPDATE iam.backup_restorations SET status = 'failed', finished_at = now(),
       error_summary = 'La restauración se interrumpió antes de terminar'
       WHERE status = 'running' AND started_at < now() - interval '24 hours'`,
    );
  }

  private async maybeRunDaily(): Promise<void> {
    const time = localHourAndMinute();
    if (
      time.hour < SCHEDULE_HOUR ||
      (time.hour === SCHEDULE_HOUR && time.minute < SCHEDULE_MINUTE)
    )
      return;
    if (!(await this.configuration.hasConfiguration())) return;
    const day = localDay();
    const [existing] = (await this.dataSource.query(
      `SELECT id, status, started_at FROM iam.backup_runs
       WHERE schedule_day = $1::date LIMIT 1`,
      [day],
    )) as Array<{
      id: string;
      status: 'running' | 'succeeded' | 'partial' | 'failed';
      started_at: Date;
    }>;
    if (!existing) {
      const run = await this.createRun('daily', null, day);
      await this.runBackup(run.id, 'daily', null);
      return;
    }
    if (existing.status === 'succeeded' || existing.status === 'running')
      return;
    if (Date.now() - new Date(existing.started_at).getTime() < 15 * 60_000)
      return;
    const [retryState] = (await this.dataSource.query(
      `SELECT NOT EXISTS (
         SELECT tenant_id FROM iam.backup_artifacts
         WHERE run_id = $1 AND status = 'failed'
         GROUP BY tenant_id HAVING count(*) >= 3
       ) AS can_retry`,
      [existing.id],
    )) as Array<{ can_retry: boolean }>;
    if (!retryState.can_retry) return;

    await this.dataSource.query(
      `UPDATE iam.backup_runs SET status = 'running', started_at = now(),
       finished_at = NULL, error_summary = NULL WHERE id = $1`,
      [existing.id],
    );
    await this.runBackup(existing.id, 'daily', null);
  }

  private async withOperationLock<T>(operation: () => Promise<T>): Promise<T> {
    if (this.locallyRunning)
      throw new ConflictException('Ya hay una operación de copias en curso.');
    this.locallyRunning = true;
    const runner = this.dataSource.createQueryRunner();
    let locked = false;
    try {
      await runner.connect();
      const [result] = (await runner.query(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [OPERATION_LOCK],
      )) as Array<{ locked: boolean }>;
      locked = result.locked;
      if (!locked)
        throw new ConflictException('Ya hay una operación de copias en curso.');
      return await operation();
    } finally {
      if (locked)
        await runner
          .query('SELECT pg_advisory_unlock($1)', [OPERATION_LOCK])
          .catch(() => undefined);
      await runner.release().catch(() => undefined);
      this.locallyRunning = false;
    }
  }

  private async createRun(
    mode: 'manual' | 'daily' | 'pre_restore',
    actorId: string | null,
    scheduleDay?: string,
  ) {
    const [run] = (await this.dataSource.query(
      `INSERT INTO iam.backup_runs (mode, status, actor_id, schedule_day)
       VALUES ($1, 'running', $2, $3::date) RETURNING id`,
      [mode, actorId, scheduleDay ?? null],
    )) as Array<{ id: string }>;
    return run;
  }

  private async runBackup(
    runId: string,
    mode: 'manual' | 'daily' | 'pre_restore',
    actorId: string | null,
    onlyTenantId?: string,
  ) {
    const allTenants = onlyTenantId
      ? ((await this.dataSource.query(
          'SELECT id, name FROM iam.tenants WHERE id = $1 ORDER BY id',
          [onlyTenantId],
        )) as Tenant[])
      : ((await this.dataSource.query(
          'SELECT id, name FROM iam.tenants ORDER BY id',
        )) as Tenant[]);
    await this.dataSource.query(
      `UPDATE iam.backup_runs SET tenant_count = $2, success_count = 0 WHERE id = $1`,
      [runId, allTenants.length],
    );
    const previouslySucceeded =
      mode === 'daily'
        ? (
            (await this.dataSource.query(
              `SELECT DISTINCT tenant_id FROM iam.backup_artifacts
             WHERE run_id = $1 AND status = 'succeeded'`,
              [runId],
            )) as Array<{ tenant_id: string }>
          ).map((row) => row.tenant_id)
        : [];
    const succeededTenants = new Set(previouslySucceeded);
    const tenants = allTenants.filter(
      (tenant) => !succeededTenants.has(tenant.id),
    );
    let successCount = succeededTenants.size;
    for (const tenant of tenants) {
      const artifactId = randomBytes(16).toString('hex');
      const day = localDay();
      const objectKey = `mederi-backups/v1/${tenant.id}/${day}/${runId}-${artifactId}.tar.gz.enc`;
      const [artifact] = (await this.dataSource.query(
        `INSERT INTO iam.backup_artifacts (run_id, tenant_id, tenant_name, object_key, status)
         VALUES ($1, $2, $3, $4, 'running') RETURNING id`,
        [runId, tenant.id, tenant.name, objectKey],
      )) as Array<{ id: string }>;
      try {
        const snapshot = await this.captureSnapshot(tenant);
        const uploaded = await this.uploadSnapshot(
          objectKey,
          tenant.id,
          snapshot,
        );
        await this.dataSource.query(
          `UPDATE iam.backup_artifacts SET status = 'succeeded', size_bytes = $2, sha256 = $3 WHERE id = $1`,
          [artifact.id, uploaded.sizeBytes, uploaded.sha256],
        );
        successCount++;
      } catch (error) {
        await this.deleteObjectQuietly(objectKey);
        await this.dataSource.query(
          `UPDATE iam.backup_artifacts SET status = 'failed', error_summary = 'No se pudo guardar la copia de esta clínica' WHERE id = $1`,
          [artifact.id],
        );
        this.logger.error(
          `Falló la copia de la clínica ${tenant.id}: ${error instanceof Error ? error.name : 'error'}`,
        );
      }
    }
    const status =
      successCount === allTenants.length
        ? 'succeeded'
        : successCount > 0
          ? 'partial'
          : 'failed';
    await this.dataSource.query(
      `UPDATE iam.backup_runs SET status = $2, finished_at = now(), tenant_count = $3::integer,
       success_count = $4::integer, error_summary = CASE WHEN $4::integer < $3::integer THEN 'Una o más clínicas no tienen una copia válida' ELSE NULL END WHERE id = $1`,
      [runId, status, allTenants.length, successCount],
    );
    await this.pruneExpiredObjects().catch(() =>
      this.logger.error('No se pudo limpiar el historial vencido de B2.'),
    );
    return {
      id: runId,
      mode,
      status,
      tenantCount: allTenants.length,
      successCount,
    };
  }

  private async captureSnapshot(tenant: Tenant): Promise<Snapshot> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction('REPEATABLE READ');
    try {
      await runner.query('SET TRANSACTION READ ONLY');
      await runner.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenant.id,
      ]);
      const [tenantRow] = (await runner.query(
        'SELECT * FROM iam.tenants WHERE id = $1',
        [tenant.id],
      )) as JsonRow[];
      if (!tenantRow) throw new Error('tenant_missing');
      const tables = await this.tenantTables(runner);
      const rowsByTable: Record<string, JsonRow[]> = {};
      for (const table of tables) {
        const name = tableKey(table);
        const rows = (await runner.query(
          `SELECT * FROM ${quoteIdent(table.schema)}.${quoteIdent(table.name)} WHERE tenant_id = $1`,
          [tenant.id],
        )) as JsonRow[];
        rowsByTable[name] = rows;
      }
      const migrationRows = (await runner.query(
        'SELECT name FROM public.migrations ORDER BY timestamp',
      )) as Array<{ name: string }>;
      const attachmentRows = (rowsByTable[
        'public.clinical_entry_attachments'
      ] ?? []) as AttachmentRef[];
      const fileRefs = [];
      for (const attachment of attachmentRows) {
        const archivePath = this.attachmentArchivePath(
          tenant.id,
          attachment.storage_key,
        );
        const sizeBytes = await this.attachments.size(attachment.storage_key);
        if (
          sizeBytes !== Number(attachment.size_bytes) ||
          sizeBytes > MAX_ATTACHMENT_BYTES
        ) {
          throw new Error('attachment_size_mismatch');
        }
        fileRefs.push({
          storageKey: attachment.storage_key,
          sizeBytes,
          archivePath,
        });
      }
      await runner.commitTransaction();
      return {
        manifest: {
          formatVersion: 1,
          tenant: tenantRow,
          createdAt: new Date().toISOString(),
          migrations: migrationRows.map((row) => row.name),
          tables: Object.keys(rowsByTable),
          attachments: fileRefs,
        },
        tables: rowsByTable,
      };
    } catch (error) {
      await runner.rollbackTransaction().catch(() => undefined);
      throw error;
    } finally {
      await runner.release();
    }
  }

  private async tenantTables(runner: QueryRunner): Promise<TableId[]> {
    const rows =
      (await runner.query(`SELECT DISTINCT n.nspname AS schema, c.relname AS name
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
      WHERE c.relkind = 'r' AND n.nspname IN ('iam', 'public')
        AND a.attname = 'tenant_id' AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY n.nspname, c.relname`)) as TableId[];
    return rows.filter((table) => !EXCLUDED_TENANT_TABLES.has(tableKey(table)));
  }

  private attachmentArchivePath(tenantId: string, storageKey: string): string {
    const key = storageKey.replaceAll('\\', '/');
    const parts = key.split('/');
    if (
      parts[0] !== tenantId ||
      parts.length !== 3 ||
      parts.some((part) => !part || part === '.' || part === '..')
    ) {
      throw new Error('attachment_path_invalid');
    }
    return `attachments/${parts.join('/')}`;
  }

  private async uploadSnapshot(
    objectKey: string,
    tenantId: string,
    snapshot: Snapshot,
  ): Promise<{ sizeBytes: number; sha256: string }> {
    const { client, bucket } = await this.configuration.openClient();
    const pack = tarStream.pack();
    const gzip = createGzip({ level: 6 });
    const { encryptionKey, authenticationKey } =
      this.configuration.archiveKeyMaterial();
    const salt = randomBytes(16);
    const iv = randomBytes(16);
    const keyMaterial = Buffer.from(
      hkdfSync('sha512', encryptionKey, salt, 'mederi-backup-object-v1', 64),
    );
    const header = Buffer.concat([MAGIC, salt, iv]);
    const hmac = createHmac('sha256', authenticationKey)
      .update(salt)
      .update(keyMaterial.subarray(32));
    // Bind the per-object encryption key into authentication as well as the header.
    hmac.update(header);
    const cipher = createCipheriv(
      'aes-256-ctr',
      keyMaterial.subarray(0, 32),
      iv,
    );
    const appendMac = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hmac.update(chunk);
        callback(null, chunk);
      },
      flush(callback) {
        callback(null, hmac.digest());
      },
    });
    const hash = createHash('sha256');
    hash.update(header);
    let sizeBytes = header.length;
    const digest = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        sizeBytes += chunk.length;
        callback(null, chunk);
      },
    });
    const body = new PassThrough();
    body.write(header);
    const uploader = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: objectKey,
        Body: body,
        ContentType: 'application/vnd.mederi.backup',
        Metadata: { 'tenant-id': tenantId, 'format-version': '1' },
      },
      queueSize: 2,
      partSize: 8 * 1024 * 1024,
      leavePartsOnError: false,
    });
    const uploadDone = uploader.done().catch((error) => {
      body.destroy(error as Error);
      throw error;
    });
    const pipeDone = pipeline(pack, gzip, cipher, appendMac, digest, body);
    try {
      const manifest = Buffer.from(
        JSON.stringify(encodeJsonValue(snapshot.manifest)),
      );
      await this.addBuffer(pack, 'manifest.json', manifest);
      const database = Buffer.from(
        JSON.stringify(encodeJsonValue(snapshot.tables)),
      );
      await this.addBuffer(pack, 'database.json', database);
      for (const attachment of snapshot.manifest.attachments) {
        const source = this.attachments.createReadStream(attachment.storageKey);
        const entry = pack.entry({
          name: attachment.archivePath,
          size: attachment.sizeBytes,
          type: 'file',
        });
        await pipeline(source, entry);
      }
      pack.finalize();
      await Promise.all([pipeDone, uploadDone]);
      return { sizeBytes, sha256: hash.digest('hex') };
    } catch (error) {
      pack.destroy(error as Error);
      body.destroy(error as Error);
      await Promise.allSettled([pipeDone, uploadDone]);
      throw error;
    } finally {
      client.destroy();
    }
  }

  private async addBuffer(
    pack: tarStream.Pack,
    name: string,
    data: Buffer,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const entry = pack.entry(
        { name, size: data.length, type: 'file' },
        (error) => (error ? reject(error) : resolve()),
      );
      entry.end(data);
    });
  }

  private async restoreArtifact(
    artifact: Pick<
      ArtifactRow,
      'tenant_id' | 'object_key' | 'size_bytes' | 'sha256'
    >,
    tenantId: string,
  ): Promise<void> {
    if (artifact.tenant_id !== tenantId || !artifact.sha256)
      throw new BadRequestException('La copia no corresponde a esta clínica.');
    const temp = await mkdtemp(path.join(os.tmpdir(), 'mederi-restore-'));
    await mkdir(path.join(temp, 'extract'), { mode: 0o700 });
    const encryptedPath = path.join(temp, 'snapshot.enc');
    const archivePath = path.join(temp, 'snapshot.tar.gz');
    const extractDir = path.join(temp, 'extract');
    const { client, bucket } = await this.configuration.openClient();
    let stagedKeys: string[] = [];
    try {
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: artifact.object_key }),
      );
      if (!response.Body) throw new Error('backup_body_missing');
      await pipeline(
        response.Body as Readable,
        createWriteStream(encryptedPath, { mode: 0o600, flags: 'wx' }),
      );
      const encryptedStat = await stat(encryptedPath);
      if (
        artifact.size_bytes &&
        encryptedStat.size !== Number(artifact.size_bytes)
      )
        throw new Error('backup_size_mismatch');
      const { encryptionKey, authenticationKey } =
        this.configuration.archiveKeyMaterial();
      await this.verifyAndDecrypt(
        encryptedPath,
        archivePath,
        artifact.sha256,
        encryptionKey,
        authenticationKey,
      );
      await tar.extract({
        file: archivePath,
        cwd: extractDir,
        strict: true,
        filter: (entryPath, entry) => {
          if (!('type' in entry) || entry.type !== 'File') return false;
          if (entryPath === 'manifest.json' || entryPath === 'database.json')
            return true;
          return (
            entryPath.startsWith(`attachments/${tenantId}/`) &&
            !entryPath.split('/').some((part) => part === '.' || part === '..')
          );
        },
      });
      const manifest = decodeJsonValue(
        JSON.parse(
          await readFile(path.join(extractDir, 'manifest.json'), 'utf8'),
        ),
      ) as SnapshotManifest;
      const tables = decodeJsonValue(
        JSON.parse(
          await readFile(path.join(extractDir, 'database.json'), 'utf8'),
        ),
      ) as Record<string, JsonRow[]>;
      this.validateSnapshot(manifest, tables, tenantId);
      const staged = await this.stageAttachments(
        extractDir,
        manifest,
        tables,
        tenantId,
      );
      stagedKeys = staged.stagedKeys;
      const oldStorageKeys = await this.applySnapshot(
        manifest,
        tables,
        tenantId,
        staged.rekeyedStorageKeys,
      );
      await this.attachments.deleteMany(oldStorageKeys);
    } catch (error) {
      await this.attachments.deleteMany(stagedKeys);
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        `Falló la restauración de la clínica ${tenantId}: ${error instanceof Error ? error.name : 'error'}`,
      );
      throw new BadRequestException(
        'No se pudo validar o aplicar la copia. Los datos actuales siguen protegidos por una transacción.',
      );
    } finally {
      client.destroy();
      await rm(temp, { recursive: true, force: true });
    }
  }

  private async verifyAndDecrypt(
    encryptedPath: string,
    archivePath: string,
    expectedSha: string,
    encryptionKey: Buffer,
    authenticationKey: Buffer,
  ): Promise<void> {
    const fileInfo = await stat(encryptedPath);
    if (fileInfo.size < HEADER_BYTES + MAC_BYTES)
      throw new Error('backup_too_small');
    const handle = await open(encryptedPath, 'r');
    const header = Buffer.alloc(HEADER_BYTES);
    const tag = Buffer.alloc(MAC_BYTES);
    try {
      await handle.read(header, 0, HEADER_BYTES, 0);
      await handle.read(tag, 0, MAC_BYTES, fileInfo.size - MAC_BYTES);
    } finally {
      await handle.close();
    }
    if (!header.subarray(0, MAGIC.length).equals(MAGIC))
      throw new Error('backup_magic_invalid');
    const salt = header.subarray(8, 24);
    const iv = header.subarray(24, 40);
    const actualHash = createHash('sha256').update(header);
    const hmac = createHmac('sha256', authenticationKey).update(salt);
    const keyMaterial = Buffer.from(
      hkdfSync('sha512', encryptionKey, salt, 'mederi-backup-object-v1', 64),
    );
    hmac.update(keyMaterial.subarray(32)).update(header);
    for await (const chunk of createReadStream(encryptedPath, {
      start: HEADER_BYTES,
      end: fileInfo.size - MAC_BYTES - 1,
    })) {
      actualHash.update(chunk);
      hmac.update(chunk);
    }
    actualHash.update(tag);
    const actualSha = actualHash.digest('hex');
    if (actualSha !== expectedSha) throw new Error('backup_checksum_invalid');
    const expectedTag = hmac.digest();
    if (!timingSafeEqual(tag, expectedTag))
      throw new Error('backup_auth_invalid');
    const decipher = createDecipheriv(
      'aes-256-ctr',
      keyMaterial.subarray(0, 32),
      iv,
    );
    await pipeline(
      createReadStream(encryptedPath, {
        start: HEADER_BYTES,
        end: fileInfo.size - MAC_BYTES - 1,
      }),
      decipher,
      createWriteStream(archivePath, { mode: 0o600, flags: 'wx' }),
    );
  }

  private validateSnapshot(
    manifest: SnapshotManifest,
    tables: Record<string, JsonRow[]>,
    tenantId: string,
  ): void {
    if (
      manifest.formatVersion !== 1 ||
      manifest.tenant?.id !== tenantId ||
      !Array.isArray(manifest.attachments) ||
      !Array.isArray(manifest.tables)
    ) {
      throw new BadRequestException(
        'La copia no es válida o pertenece a otra clínica.',
      );
    }
    for (const [name, rows] of Object.entries(tables)) {
      if (
        !/^(iam|public)\.[a-z_][a-z0-9_]*$/.test(name) ||
        EXCLUDED_TENANT_TABLES.has(name) ||
        !Array.isArray(rows)
      ) {
        throw new BadRequestException('La copia contiene tablas no admitidas.');
      }
      for (const row of rows) {
        if (row.tenant_id !== tenantId)
          throw new BadRequestException(
            'La copia contiene datos de otra clínica.',
          );
      }
    }
    const keys = new Set<string>();
    for (const attachment of manifest.attachments) {
      const archivePath = this.attachmentArchivePath(
        tenantId,
        attachment.storageKey,
      );
      if (
        archivePath !== attachment.archivePath ||
        !Number.isInteger(attachment.sizeBytes) ||
        attachment.sizeBytes < 0 ||
        attachment.sizeBytes > MAX_ATTACHMENT_BYTES
      ) {
        throw new BadRequestException(
          'La copia contiene un adjunto no válido.',
        );
      }
      keys.add(attachment.storageKey);
    }
    const metadata = (tables['public.clinical_entry_attachments'] ??
      []) as AttachmentRef[];
    if (
      metadata.length !== keys.size ||
      metadata.some(
        (attachment) =>
          !keys.has(attachment.storage_key) ||
          Number(attachment.size_bytes) !==
            manifest.attachments.find(
              (file) => file.storageKey === attachment.storage_key,
            )?.sizeBytes,
      )
    ) {
      throw new BadRequestException(
        'La copia no contiene todos los adjuntos de la clínica.',
      );
    }
  }

  private async stageAttachments(
    extractDir: string,
    manifest: SnapshotManifest,
    tables: Record<string, JsonRow[]>,
    tenantId: string,
  ) {
    const stagedKeys: string[] = [];
    const rekeyedStorageKeys = new Map<string, string>();
    try {
      for (const attachment of manifest.attachments) {
        const fullPath = path.resolve(extractDir, attachment.archivePath);
        if (!fullPath.startsWith(path.resolve(extractDir) + path.sep))
          throw new Error('attachment_path_invalid');
        const info = await stat(fullPath);
        if (info.size !== attachment.sizeBytes)
          throw new Error('attachment_size_mismatch');
        const bytes = await readFile(fullPath);
        const rows = (tables['public.clinical_entry_attachments'] ??
          []) as Array<JsonRow & AttachmentRef & { clinical_entry_id: string }>;
        const metadata = rows.find(
          (row) => row.storage_key === attachment.storageKey,
        );
        if (!metadata || Number(metadata.size_bytes) !== bytes.length)
          throw new Error('attachment_reference_invalid');
        if (
          ![
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/webp',
          ].includes(metadata.mime_type)
        )
          throw new Error('attachment_mime_invalid');
        const extension = extensionFor(
          metadata.mime_type as
            'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp',
        );
        const newKey = await this.attachments.save(
          tenantId,
          metadata.clinical_entry_id,
          extension,
          bytes,
        );
        stagedKeys.push(newKey);
        rekeyedStorageKeys.set(attachment.storageKey, newKey);
      }
      return { stagedKeys, rekeyedStorageKeys };
    } catch (error) {
      await this.attachments.deleteMany(stagedKeys);
      throw error;
    }
  }

  private async applySnapshot(
    manifest: SnapshotManifest,
    tables: Record<string, JsonRow[]>,
    tenantId: string,
    rekeyed: Map<string, string>,
  ): Promise<string[]> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction('SERIALIZABLE');
    try {
      await runner.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenantId,
      ]);
      const scopedTables = await this.tenantTables(runner);
      const existingAttachments = (await runner.query(
        'SELECT storage_key FROM public.clinical_entry_attachments WHERE tenant_id = $1',
        [tenantId],
      )) as Array<{ storage_key: string }>;
      const ordered = await this.orderTablesByForeignKeys(runner, scopedTables);
      for (const table of [...ordered].reverse()) {
        if (PRESERVED_ON_RESTORE.has(tableKey(table))) continue;
        await runner.query(
          `DELETE FROM ${quoteIdent(table.schema)}.${quoteIdent(table.name)} WHERE tenant_id = $1`,
          [tenantId],
        );
      }
      const [tenant] = (await runner.query(
        'SELECT id FROM iam.tenants WHERE id = $1 FOR UPDATE',
        [tenantId],
      )) as Array<{ id: string }>;
      if (!tenant) throw new Error('tenant_missing');
      await this.updateTenantRow(runner, manifest.tenant, tenantId);
      for (const table of ordered) {
        const name = tableKey(table);
        if (PRESERVED_ON_RESTORE.has(name)) {
          // Retain current reminder attempts so an older snapshot cannot make an already-sent reminder fire again.
        }
        const rows = tables[name] ?? [];
        if (!rows.length) continue;
        await this.insertRows(
          runner,
          table,
          rows.map((row) => {
            const copy = { ...row };
            if (
              name === 'public.clinical_entry_attachments' &&
              typeof copy.storage_key === 'string'
            ) {
              copy.storage_key =
                rekeyed.get(copy.storage_key) ?? copy.storage_key;
            }
            return copy;
          }),
          tenantId,
          PRESERVED_ON_RESTORE.has(name),
        );
      }
      await runner.commitTransaction();
      return existingAttachments.map((row) => row.storage_key);
    } catch (error) {
      await runner.rollbackTransaction().catch(() => undefined);
      throw error;
    } finally {
      await runner.release();
    }
  }

  private async updateTenantRow(
    runner: QueryRunner,
    saved: JsonRow,
    tenantId: string,
  ): Promise<void> {
    const columns = (await runner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'iam' AND table_name = 'tenants' ORDER BY ordinal_position`,
    )) as Array<{ column_name: string }>;
    const allowed = new Set(columns.map((column) => column.column_name));
    const updates = Object.entries(saved).filter(
      ([key]) => key !== 'id' && allowed.has(key),
    );
    if (!updates.length) return;
    const set = updates
      .map(([key], index) => `${quoteIdent(key)} = $${index + 1}`)
      .join(', ');
    await runner.query(
      `UPDATE iam.tenants SET ${set} WHERE id = $${updates.length + 1}`,
      [...updates.map(([, value]) => value), tenantId],
    );
  }

  private async insertRows(
    runner: QueryRunner,
    table: TableId,
    rows: JsonRow[],
    tenantId: string,
    ignoreConflicts: boolean,
  ): Promise<void> {
    const columnInfo = (await runner.query(
      `SELECT column_name, is_nullable, column_default, is_generated, is_identity
      FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
      [table.schema, table.name],
    )) as Array<{
      column_name: string;
      is_nullable: 'YES' | 'NO';
      column_default: string | null;
      is_generated: string;
      is_identity: string;
    }>;
    const keys = new Set(rows.flatMap((row) => Object.keys(row)));
    const columns = columnInfo.filter(
      (column) =>
        keys.has(column.column_name) && column.is_generated === 'NEVER',
    );
    const present = new Set(columns.map((column) => column.column_name));
    const missingRequired = columnInfo.find(
      (column) =>
        column.is_nullable === 'NO' &&
        !column.column_default &&
        column.is_generated === 'NEVER' &&
        column.is_identity !== 'YES' &&
        !present.has(column.column_name),
    );
    if (missingRequired)
      throw new Error(
        `required_column_missing:${tableKey(table)}:${missingRequired.column_name}`,
      );
    if (!columns.length)
      throw new Error(`no_columns_to_restore:${tableKey(table)}`);
    const columnNames = columns
      .map((column) => quoteIdent(column.column_name))
      .join(', ');
    const batchSize = Math.max(1, Math.floor(60_000 / columns.length));
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const batch = rows.slice(offset, offset + batchSize);
      const values: unknown[] = [];
      const tuples = batch.map((row) => {
        if (row.tenant_id !== tenantId) throw new Error('cross_tenant_restore');
        const tuple = columns.map((column) => {
          values.push(row[column.column_name] ?? null);
          return `$${values.length}`;
        });
        return `(${tuple.join(', ')})`;
      });
      const conflict = ignoreConflicts ? ' ON CONFLICT DO NOTHING' : '';
      await runner.query(
        `INSERT INTO ${quoteIdent(table.schema)}.${quoteIdent(table.name)} (${columnNames}) VALUES ${tuples.join(', ')}${conflict}`,
        values,
      );
    }
  }

  private async orderTablesByForeignKeys(
    runner: QueryRunner,
    tables: TableId[],
  ): Promise<TableId[]> {
    const tableMap = new Map(tables.map((table) => [tableKey(table), table]));
    const dependencies =
      (await runner.query(`SELECT tc.table_schema AS child_schema, tc.table_name AS child_table,
        ccu.table_schema AS parent_schema, ccu.table_name AS parent_table
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'`)) as Array<{
        child_schema: string;
        child_table: string;
        parent_schema: string;
        parent_table: string;
      }>;
    const parents = new Map<string, Set<string>>();
    for (const key of tableMap.keys()) parents.set(key, new Set());
    for (const dependency of dependencies) {
      const child = `${dependency.child_schema}.${dependency.child_table}`;
      const parent = `${dependency.parent_schema}.${dependency.parent_table}`;
      if (tableMap.has(child) && tableMap.has(parent) && child !== parent)
        parents.get(child)?.add(parent);
    }
    const result: TableId[] = [];
    const remaining = new Set(tableMap.keys());
    while (remaining.size) {
      const next = [...remaining]
        .filter((name) =>
          [...(parents.get(name) ?? [])].every(
            (parent) => !remaining.has(parent),
          ),
        )
        .sort()[0];
      if (!next) throw new Error('tenant_table_dependency_cycle');
      remaining.delete(next);
      result.push(tableMap.get(next)!);
    }
    return result;
  }

  private async pruneExpiredObjects(): Promise<void> {
    const expired = (await this.dataSource.query(
      `SELECT id, object_key FROM iam.backup_artifacts WHERE created_at < now() - ($1::integer * interval '1 day')`,
      [RETENTION_DAYS],
    )) as Array<{ id: string; object_key: string }>;
    if (!expired.length) return;
    const { client, bucket } = await this.configuration.openClient();
    try {
      for (const item of expired) {
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: item.object_key }),
        );
        await this.dataSource.query(
          'DELETE FROM iam.backup_artifacts WHERE id = $1',
          [item.id],
        );
      }
      await this.dataSource.query(
        `DELETE FROM iam.backup_runs WHERE finished_at < now() - ($1::integer * interval '1 day')`,
        [RETENTION_DAYS],
      );
      await this.dataSource.query(
        `DELETE FROM iam.backup_restorations WHERE finished_at < now() - ($1::integer * interval '1 day')`,
        [RETENTION_DAYS],
      );
    } finally {
      client.destroy();
    }
  }

  private async deleteObjectQuietly(key: string): Promise<void> {
    try {
      const { client, bucket } = await this.configuration.openClient();
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: key }),
        );
      } finally {
        client.destroy();
      }
    } catch {
      /* Preserve the original backup error. */
    }
  }
}
