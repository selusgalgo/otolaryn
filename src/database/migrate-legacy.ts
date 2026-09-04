import 'dotenv/config';
import * as argon2 from 'argon2';
import * as XLSX from 'xlsx';
import { DataSource } from 'typeorm';
import migrationDataSource from './data-source';
import { fusionarPacientesDuplicados } from '../patients/use-cases/fusionar-pacientes-duplicados';

// Migrates real historical data from the legacy OTOLARYN desktop app
// (pacientes.xls, consultas.xls, ENTIDADES.xls) into the current schema.
// See prompt_migracion_claude_code.md for the full spec this implements,
// and arquitectura_otolaryn_saas.md sección 12 for the decisions taken on
// the known exceptions (excepciones_migracion.xlsx).
//
// Order: Entidades → Pacientes (con fusión de duplicados y antecedentes) →
// Consultas. Each paso runs in its own transaction and is safe to re-run:
// a paso that fails rolls back entirely (nothing partial persists to dupe
// on retry), and a paso that already succeeded skips rows it recognizes via
// legacy_id (patients) or the row-index legacy_id (clinical_entries).
//
// Usage:
//   npm run migrate:legacy -- \
//     --pacientes=/path/pacientes.xls \
//     --consultas=/path/consultas.xls \
//     --entidades=/path/ENTIDADES.xls \
//     [--tenant="Clinica Boreal"]

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

const PACIENTES_PATH = arg('pacientes');
const CONSULTAS_PATH = arg('consultas');
const ENTIDADES_PATH = arg('entidades');
const TENANT_NAME = arg('tenant') ?? 'Clinica Boreal';

// Same dev-only convention as seed.ts. This script is only meant to run
// locally for now (per the "local primero" decision) — a production run
// needs a real password strategy for the two doctor accounts, not this.
const DEV_PASSWORD = 'Passw0rd!';

if (!PACIENTES_PATH || !CONSULTAS_PATH || !ENTIDADES_PATH) {
  console.error(
    'Uso: npm run migrate:legacy -- --pacientes=<ruta> --consultas=<ruta> --entidades=<ruta> [--tenant="Clinica Boreal"]',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Source row shapes (column names exactly as in the legacy .xls exports —
// confirmed against excepciones_migracion.xlsx's headers)
// ---------------------------------------------------------------------------

interface EntidadRow {
  CLAVE: number | string;
  ENTIDAD: string;
}

interface PacienteRow {
  NUMHISTORIA: number | string;
  NOMBRE: string;
  APELLIDOS: string;
  DIRECCION?: string | null;
  TELEFONO?: string | null;
  FNACIMIENTO: unknown;
  PROFESION?: string | null;
  ENTIDAD?: string | null;
  FPRIMERACONSULTA: unknown;
  HISTORIA?: string | null;
  TABACO?: string | null;
  ALCOHOL?: string | null;
  DIABETES?: string | null;
  HTA?: string | null;
  EPOC?: string | null;
  GLAUCOMA?: string | null;
  GASTRALGIAS?: string | null;
  ALERGIASAMBIENTALES?: string | null;
  ALERGIASMEDICAMENTOSAS?: string | null;
  CIRUGIAS?: string | null;
  TUMORES?: string | null;
  SORDERA?: string | null;
  OTRAS?: string | null;
  [key: string]: unknown;
}

interface ConsultaRow {
  NUMHISTORIA: number | string;
  FECHA: unknown;
  MOTIVO?: string | null;
  EXPLORACION?: string | null;
  TRATAMIENTO?: string | null;
  ENTIDAD?: string | null;
  DOCTOR?: string | null;
}

// column in pacientes.xls -> antecedente_types.name seeded by
// PatientAntecedentes1733900000000 (must match exactly).
const ANTECEDENTE_COLUMNS: { column: keyof PacienteRow; typeName: string }[] = [
  { column: 'TABACO', typeName: 'Tabaco' },
  { column: 'ALCOHOL', typeName: 'Alcohol' },
  { column: 'DIABETES', typeName: 'Diabetes' },
  { column: 'HTA', typeName: 'HTA' },
  { column: 'EPOC', typeName: 'EPOC' },
  { column: 'GLAUCOMA', typeName: 'Glaucoma' },
  { column: 'GASTRALGIAS', typeName: 'Gastralgias' },
  { column: 'ALERGIASAMBIENTALES', typeName: 'Alergias ambientales' },
  { column: 'ALERGIASMEDICAMENTOSAS', typeName: 'Alergias medicamentosas' },
  { column: 'CIRUGIAS', typeName: 'Cirugías' },
  { column: 'TUMORES', typeName: 'Tumores' },
  { column: 'SORDERA', typeName: 'Sordera' },
  { column: 'OTRAS', typeName: 'Otras' },
];

const DOCTORS = [
  {
    legacyName: 'Dr. Federico Sepúlveda Cariñanos',
    email: 'desarrollo@eiduo.es',
    firstName: 'Federico',
    lastName: 'Sepúlveda Cariñanos',
  },
  {
    legacyName: 'Dr. Miguel Shepherd González',
    email: 'agencia@eiduo.es',
    firstName: 'Miguel',
    lastName: 'Shepherd González',
  },
];

// The one antecedente that stays unresolved on purpose — see
// prompt_migracion_claude_code.md paso 2.8.
const PENDING_HTA_NUMHISTORIA = 145;

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function readSheet<T>(filePath: string): T[] {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<T>(sheet, { defval: null });
}

// Day-first, tolerant of missing leading zeros ("7/08/2008", "30/1/1965").
// Cells Excel already formatted as dates come through as real Date objects
// (cellDates: true) and are returned as-is; only plain-text cells need this.
function parseLegacyDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  // Rejects e.g. 31/02/2020 — new Date() would otherwise silently roll it
  // into March, hiding a bad source value instead of surfacing it.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function toDateOnlyString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeName(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toUpperCase().replace(/\s+/g, ' ')
    : '';
}

// TRIM + unify uppercase, per prompt_migracion_claude_code.md paso 1 — this
// is what actually gets stored, not just a comparison key. Deliberately
// does not fix "DIPUTACIION"'s spelling.
function normalizeEntityName(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function isAffirmative(raw: string): boolean {
  return stripAccents(raw.trim().toLowerCase()) === 'si';
}

function isNegative(raw: string): boolean {
  return stripAccents(raw.trim().toLowerCase()) === 'no';
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

interface Report {
  tenantId: string;
  tenantName: string;
  doctorsCreated: string[];
  doctorsAlreadyExisted: string[];
  entitiesSourceRows: number;
  entitiesImported: number;
  entitiesDeduped: {
    canonicalName: string;
    canonicalKey: number;
    duplicateKeys: number[];
  }[];
  patientsSourceCount: number;
  patientsInsertedThisRun: number;
  patientsAlreadyMigrated: number;
  patientsSkippedInvalidBirthDate: {
    legacyId: string;
    nombre: string;
    apellidos: string;
  }[];
  patientsDuplicateGroups: {
    survivorLegacyId: string;
    mergedLegacyIds: string[];
  }[];
  patientsQuarantinedDates: {
    legacyId: string;
    nombre: string;
    apellidos: string;
    anioOriginal: number;
  }[];
  pendingAntecedenteExceptions: {
    legacyId: string;
    column: string;
    rawValue: string;
  }[];
  consultasSourceCount: number;
  consultasInsertedThisRun: number;
  consultasAlreadyMigrated: number;
  consultasExcludedOrphans: { numHistoria: string; fecha: string | null }[];
  consultasFallbackMotivo: string[];
  unmappedEntidadWarnings: Set<string>;
}

function createReport(tenantId: string, tenantName: string): Report {
  return {
    tenantId,
    tenantName,
    doctorsCreated: [],
    doctorsAlreadyExisted: [],
    entitiesSourceRows: 0,
    entitiesImported: 0,
    entitiesDeduped: [],
    patientsSourceCount: 0,
    patientsInsertedThisRun: 0,
    patientsAlreadyMigrated: 0,
    patientsSkippedInvalidBirthDate: [],
    patientsDuplicateGroups: [],
    patientsQuarantinedDates: [],
    pendingAntecedenteExceptions: [],
    consultasSourceCount: 0,
    consultasInsertedThisRun: 0,
    consultasAlreadyMigrated: 0,
    consultasExcludedOrphans: [],
    consultasFallbackMotivo: [],
    unmappedEntidadWarnings: new Set(),
  };
}

// ---------------------------------------------------------------------------
// Setup: target tenant + the two doctor accounts
// ---------------------------------------------------------------------------

async function resolveTenantId(
  dataSource: DataSource,
  tenantName: string,
): Promise<string> {
  const rows: { id: string }[] = await dataSource.query(
    `SELECT id FROM iam.tenants WHERE name = $1`,
    [tenantName],
  );
  const tenant = rows[0];
  if (!tenant) {
    throw new Error(
      `Tenant "${tenantName}" no encontrado. Ejecuta "npm run seed" primero, o pasa --tenant con un tenant existente.`,
    );
  }
  return tenant.id;
}

// iam.users has no RLS (see User entity) — plain queries, no set_config
// needed, same as seed.ts.
async function ensureDoctors(
  dataSource: DataSource,
  tenantId: string,
  report: Report,
): Promise<void> {
  const passwordHash = await argon2.hash(DEV_PASSWORD, {
    type: argon2.argon2id,
  });

  for (const doctor of DOCTORS) {
    const existingRows: { id: string; tenant_id: string }[] =
      await dataSource.query(
        `SELECT id, tenant_id FROM iam.users WHERE lower(email) = lower($1)`,
        [doctor.email],
      );
    const existing = existingRows[0];

    if (existing) {
      if (existing.tenant_id !== tenantId) {
        throw new Error(
          `El usuario ${doctor.email} ya existe en otro tenant (${existing.tenant_id}), se esperaba ${tenantId}.`,
        );
      }
      report.doctorsAlreadyExisted.push(doctor.email);
      continue;
    }

    await dataSource.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, 'profesional', $4, $5)`,
      [tenantId, doctor.email, passwordHash, doctor.firstName, doctor.lastName],
    );
    report.doctorsCreated.push(doctor.email);
  }
}

// ---------------------------------------------------------------------------
// Paso 1 — Entidades aseguradoras
// ---------------------------------------------------------------------------

async function importEntidades(
  dataSource: DataSource,
  tenantId: string,
  rows: EntidadRow[],
  report: Report,
): Promise<Map<string, string>> {
  report.entitiesSourceRows = rows.length;
  const nameToId = new Map<string, string>();

  // Group by normalized name first — this is what actually resolves the
  // CIGNA (claves 16/18) situation: both collapse into one group and get
  // one row, no special-casing "CIGNA" by name required.
  const byName = new Map<string, number[]>();
  for (const row of rows) {
    const name = normalizeEntityName(row.ENTIDAD);
    if (!name) continue;
    const claves = byName.get(name) ?? [];
    claves.push(Number(row.CLAVE));
    byName.set(name, claves);
  }

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`SELECT set_config('app.tenant_id', $1, true)`, [
      tenantId,
    ]);

    for (const [name, claves] of byName) {
      const [existing] = (await queryRunner.query(
        `SELECT id FROM public.insurance_entities WHERE tenant_id = $1 AND lower(name) = lower($2)`,
        [tenantId, name],
      )) as { id: string }[];

      let id: string;
      if (existing) {
        id = existing.id;
      } else {
        const [inserted] = (await queryRunner.query(
          `INSERT INTO public.insurance_entities (tenant_id, name) VALUES ($1, $2) RETURNING id`,
          [tenantId, name],
        )) as { id: string }[];
        id = inserted.id;
        report.entitiesImported++;
      }
      nameToId.set(name, id);

      if (claves.length > 1) {
        const canonicalKey = Math.min(...claves);
        report.entitiesDeduped.push({
          canonicalName: name,
          canonicalKey,
          duplicateKeys: claves.filter((c) => c !== canonicalKey),
        });
      }
    }

    await queryRunner.commitTransaction();
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }

  return nameToId;
}

// ---------------------------------------------------------------------------
// Paso 2 — Pacientes
// ---------------------------------------------------------------------------

function dedupKey(row: PacienteRow): string {
  const dob = parseLegacyDate(row.FNACIMIENTO);
  const dobKey = dob
    ? toDateOnlyString(dob)
    : `SIN_FECHA:${String(row.FNACIMIENTO)}`;
  return `${normalizeName(row.NOMBRE)}|${normalizeName(row.APELLIDOS)}|${dobKey}`;
}

function parseValidFpc(
  row: PacienteRow,
  report: Report,
  legacyId: string,
): Date | null {
  const parsed = parseLegacyDate(row.FPRIMERACONSULTA);
  if (!parsed) return null;
  if (parsed.getFullYear() < 1920 || parsed.getFullYear() > 2026) {
    report.patientsQuarantinedDates.push({
      legacyId,
      nombre: String(row.NOMBRE ?? ''),
      apellidos: String(row.APELLIDOS ?? ''),
      anioOriginal: parsed.getFullYear(),
    });
    return null;
  }
  return parsed;
}

async function importPacientes(
  dataSource: DataSource,
  tenantId: string,
  rows: PacienteRow[],
  entityNameToId: Map<string, string>,
  report: Report,
): Promise<Map<string, string>> {
  report.patientsSourceCount = rows.length;
  const legacyIdToPatientId = new Map<string, string>();

  const groups = new Map<string, PacienteRow[]>();
  for (const row of rows) {
    const key = dedupKey(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`SELECT set_config('app.tenant_id', $1, true)`, [
      tenantId,
    ]);

    const antecedenteTypes = (await queryRunner.query(
      `SELECT id, name FROM public.antecedente_types WHERE tenant_id = $1`,
      [tenantId],
    )) as { id: string; name: string }[];
    const antecedenteTypeIdByName = new Map(
      antecedenteTypes.map((t) => [t.name, t.id]),
    );

    for (const group of groups.values()) {
      const processed: {
        legacyId: string;
        patientId: string;
        fpc: Date | null;
      }[] = [];

      for (const row of group) {
        const legacyId = String(row.NUMHISTORIA);

        const [existing] = (await queryRunner.query(
          `SELECT id FROM public.patients WHERE tenant_id = $1 AND legacy_id = $2`,
          [tenantId, legacyId],
        )) as { id: string }[];
        if (existing) {
          report.patientsAlreadyMigrated++;
          processed.push({
            legacyId,
            patientId: existing.id,
            fpc: parseValidFpc(row, report, legacyId),
          });
          continue;
        }

        const dob = parseLegacyDate(row.FNACIMIENTO);
        if (!dob) {
          report.patientsSkippedInvalidBirthDate.push({
            legacyId,
            nombre: String(row.NOMBRE ?? ''),
            apellidos: String(row.APELLIDOS ?? ''),
          });
          continue;
        }

        const fpc = parseValidFpc(row, report, legacyId);
        const insuranceId = row.ENTIDAD
          ? (entityNameToId.get(normalizeEntityName(row.ENTIDAD)) ?? null)
          : null;
        // No real DNI/document number exists in the legacy source at all —
        // legacy_id is already unique per tenant, so it doubles as a safe,
        // clearly-flagged placeholder that satisfies document_id's NOT NULL
        // + unique constraint without inventing a plausible-looking real one.
        const documentId = `LEGACY-${legacyId}`.slice(0, 20);
        const phone = String(row.TELEFONO ?? '').trim() || 'SIN TELEFONO';

        // PROFESION has no destination column anywhere in the target
        // schema (not mentioned in the migration prompt or the
        // architecture doc) — prepended to notes instead of silently
        // dropped, clearly labeled so it never reads as clinical narrative.
        const notesParts: string[] = [];
        const profesion = String(row.PROFESION ?? '').trim();
        if (profesion) notesParts.push(`Profesión (legado): ${profesion}`);
        const historia = String(row.HISTORIA ?? '').trim();
        if (historia) notesParts.push(historia);
        const notes = notesParts.length > 0 ? notesParts.join('\n\n') : null;

        const [inserted] = (await queryRunner.query(
          `INSERT INTO public.patients
             (tenant_id, first_name, last_name, document_id, date_of_birth, phone, address, notes, legacy_id, insurance_entity_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id`,
          [
            tenantId,
            String(row.NOMBRE ?? '').trim(),
            String(row.APELLIDOS ?? '').trim(),
            documentId,
            toDateOnlyString(dob),
            phone,
            row.DIRECCION ? String(row.DIRECCION).trim() : null,
            notes,
            legacyId,
            insuranceId,
          ],
        )) as { id: string }[];
        const patientId = inserted.id;
        report.patientsInsertedThisRun++;

        for (const { column, typeName } of ANTECEDENTE_COLUMNS) {
          const raw = row[column];
          // Defensive as much as it is a type-narrowing: a cell that isn't
          // plain text (a stray number, a formula error object) isn't a
          // valid antecedente value either way.
          if (typeof raw !== 'string') continue;
          const rawStr = raw.trim();
          if (!rawStr || isNegative(rawStr)) continue;

          if (
            Number(row.NUMHISTORIA) === PENDING_HTA_NUMHISTORIA &&
            column === 'HTA' &&
            rawStr.toUpperCase() === 'AU'
          ) {
            report.pendingAntecedenteExceptions.push({
              legacyId,
              column,
              rawValue: rawStr,
            });
            continue;
          }

          const typeId = antecedenteTypeIdByName.get(typeName);
          if (!typeId) {
            throw new Error(
              `antecedente_type "${typeName}" no existe para el tenant ${tenantId} — revisa la migración PatientAntecedentes1733900000000.`,
            );
          }
          await queryRunner.query(
            `INSERT INTO public.patient_antecedentes (tenant_id, patient_id, antecedente_type_id, detalle)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (patient_id, antecedente_type_id) DO NOTHING`,
            [
              tenantId,
              patientId,
              typeId,
              isAffirmative(rawStr) ? null : rawStr,
            ],
          );
        }

        processed.push({ legacyId, patientId, fpc });
      }

      if (processed.length > 1) {
        const withValidFpc = processed.filter((p) => p.fpc !== null);
        const survivor =
          withValidFpc.length > 0
            ? withValidFpc.reduce((a, b) => (a.fpc! < b.fpc! ? a : b))
            : processed[0];
        const duplicates = processed.filter((p) => p !== survivor);

        await fusionarPacientesDuplicados(
          queryRunner.manager,
          survivor.patientId,
          duplicates.map((d) => d.patientId),
        );

        report.patientsDuplicateGroups.push({
          survivorLegacyId: survivor.legacyId,
          mergedLegacyIds: duplicates.map((d) => d.legacyId),
        });

        for (const p of processed) {
          legacyIdToPatientId.set(p.legacyId, survivor.patientId);
        }
      } else if (processed.length === 1) {
        legacyIdToPatientId.set(processed[0].legacyId, processed[0].patientId);
      }
    }

    await queryRunner.commitTransaction();
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }

  return legacyIdToPatientId;
}

// ---------------------------------------------------------------------------
// Paso 3 — Consultas → episodios clínicos (clinical_entries)
// ---------------------------------------------------------------------------

async function importConsultas(
  dataSource: DataSource,
  tenantId: string,
  rows: ConsultaRow[],
  legacyIdToPatientId: Map<string, string>,
  entityNameToId: Map<string, string>,
  report: Report,
): Promise<void> {
  report.consultasSourceCount = rows.length;

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`SELECT set_config('app.tenant_id', $1, true)`, [
      tenantId,
    ]);

    const doctorUserId = new Map<string, string>();
    for (const doctor of DOCTORS) {
      const [user] = (await queryRunner.query(
        `SELECT id FROM iam.users WHERE tenant_id = $1 AND lower(email) = lower($2)`,
        [tenantId, doctor.email],
      )) as { id: string }[];
      if (!user) {
        throw new Error(
          `Usuario ${doctor.email} no encontrado en el tenant ${tenantId} — ensureDoctors debería haberlo creado.`,
        );
      }
      doctorUserId.set(doctor.legacyName, user.id);
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowLegacyId = String(i + 1);
      const numHistoria = String(row.NUMHISTORIA);

      const [existing] = (await queryRunner.query(
        `SELECT id FROM public.clinical_entries WHERE tenant_id = $1 AND legacy_id = $2`,
        [tenantId, rowLegacyId],
      )) as { id: string }[];
      if (existing) {
        report.consultasAlreadyMigrated++;
        continue;
      }

      const patientId = legacyIdToPatientId.get(numHistoria);
      if (!patientId) {
        const fecha = parseLegacyDate(row.FECHA);
        report.consultasExcludedOrphans.push({
          numHistoria,
          fecha: fecha ? toDateOnlyString(fecha) : null,
        });
        continue;
      }

      const doctorRaw = String(row.DOCTOR ?? '').trim();
      const authorUserId = doctorUserId.get(doctorRaw);
      if (!authorUserId) {
        // Fails visibly and stops the whole paso — per
        // prompt_migracion_claude_code.md paso 3.4: never assign a default
        // professional or leave it blank for an unmapped DOCTOR value.
        throw new Error(
          `DOCTOR "${doctorRaw}" no está en el mapeo conocido (fila ${i + 1} de consultas.xls, NUMHISTORIA ${numHistoria}). Abortando — revisa el valor o añade el mapeo antes de reintentar.`,
        );
      }

      const visitDate = parseLegacyDate(row.FECHA);
      const entidadName = row.ENTIDAD ? normalizeEntityName(row.ENTIDAD) : '';
      const insuranceId = entidadName
        ? (entityNameToId.get(entidadName) ?? null)
        : null;
      if (entidadName && !insuranceId) {
        report.unmappedEntidadWarnings.add(entidadName);
      }

      const motivo = String(row.MOTIVO ?? '').trim();
      if (!motivo) report.consultasFallbackMotivo.push(rowLegacyId);

      await queryRunner.query(
        `INSERT INTO public.clinical_entries
           (tenant_id, patient_id, author_user_id, visit_date, chief_complaint, examination_findings, treatment, insurance_entity_id, legacy_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          tenantId,
          patientId,
          authorUserId,
          visitDate ?? new Date(),
          motivo || '(sin motivo registrado en el origen)',
          row.EXPLORACION ? String(row.EXPLORACION).trim() : null,
          row.TRATAMIENTO ? String(row.TRATAMIENTO).trim() : null,
          insuranceId,
          rowLegacyId,
        ],
      );
      report.consultasInsertedThisRun++;
    }

    await queryRunner.commitTransaction();
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
}

// ---------------------------------------------------------------------------
// Reporte final
// ---------------------------------------------------------------------------

function printReport(report: Report): void {
  const lines: string[] = [];
  lines.push('# Migración de datos legados OTOLARYN — reporte final');
  lines.push('');
  lines.push(`Tenant destino: **${report.tenantName}** (${report.tenantId})`);
  lines.push('');

  lines.push('## Doctores (IAM)');
  lines.push(
    `- Creados: ${report.doctorsCreated.join(', ') || '(ninguno, ya existían)'}`,
  );
  lines.push(
    `- Ya existían: ${report.doctorsAlreadyExisted.join(', ') || '(ninguno)'}`,
  );
  lines.push('');

  lines.push('## Paso 1 — Entidades aseguradoras');
  lines.push(`- Filas origen: ${report.entitiesSourceRows}`);
  lines.push(
    `- Entidades insertadas (nuevas en esta ejecución): ${report.entitiesImported}`,
  );
  if (report.entitiesDeduped.length > 0) {
    lines.push(`- Duplicados fusionados por nombre:`);
    for (const d of report.entitiesDeduped) {
      lines.push(
        `  - "${d.canonicalName}": clave canónica ${d.canonicalKey}, claves fusionadas [${d.duplicateKeys.join(', ')}]`,
      );
    }
  }
  lines.push('');

  lines.push('## Paso 2 — Pacientes');
  const activeDestination =
    report.patientsInsertedThisRun +
    report.patientsAlreadyMigrated -
    report.patientsDuplicateGroups.reduce(
      (sum, g) => sum + g.mergedLegacyIds.length,
      0,
    );
  lines.push(
    `- ${report.patientsSourceCount} pacientes origen = ${activeDestination} pacientes destino activos + ${report.patientsDuplicateGroups.reduce((s, g) => s + g.mergedLegacyIds.length, 0)} duplicados fusionados` +
      (report.patientsSkippedInvalidBirthDate.length > 0
        ? ` + ${report.patientsSkippedInvalidBirthDate.length} excluidos por fecha de nacimiento inválida`
        : ''),
  );
  lines.push(
    `- Insertados en esta ejecución: ${report.patientsInsertedThisRun}`,
  );
  lines.push(
    `- Ya migrados (ejecución anterior): ${report.patientsAlreadyMigrated}`,
  );
  if (report.patientsDuplicateGroups.length > 0) {
    lines.push(
      `- Grupos de duplicados fusionados (${report.patientsDuplicateGroups.length}):`,
    );
    for (const g of report.patientsDuplicateGroups) {
      lines.push(
        `  - Superviviente NUMHISTORIA ${g.survivorLegacyId} ← fusionados [${g.mergedLegacyIds.join(', ')}]`,
      );
    }
  }
  if (report.patientsQuarantinedDates.length > 0) {
    lines.push(
      `- FPRIMERACONSULTA en cuarentena (año fuera de [1920, 2026]) — no usada para nada, requiere confirmación humana aparte:`,
    );
    for (const q of report.patientsQuarantinedDates) {
      lines.push(
        `  - NUMHISTORIA ${q.legacyId} (${q.nombre} ${q.apellidos}): año origen ${q.anioOriginal}`,
      );
    }
  }
  if (report.patientsSkippedInvalidBirthDate.length > 0) {
    lines.push(
      `- Excluidos por FNACIMIENTO no parseable (requiere revisión manual):`,
    );
    for (const p of report.patientsSkippedInvalidBirthDate) {
      lines.push(`  - NUMHISTORIA ${p.legacyId} (${p.nombre} ${p.apellidos})`);
    }
  }
  if (report.pendingAntecedenteExceptions.length > 0) {
    lines.push(
      `- Antecedentes pendientes de aclaración (no migrados como Sí ni como No):`,
    );
    for (const e of report.pendingAntecedenteExceptions) {
      lines.push(
        `  - NUMHISTORIA ${e.legacyId}: ${e.column} = "${e.rawValue}"`,
      );
    }
  }
  lines.push('');

  lines.push('## Paso 3 — Consultas → historia clínica');
  lines.push(
    `- ${report.consultasSourceCount} consultas origen = ${report.consultasInsertedThisRun} episodios insertados + ${report.consultasAlreadyMigrated} ya migrados + ${report.consultasExcludedOrphans.length} excluidas por huérfanas`,
  );
  if (report.consultasExcludedOrphans.length > 0) {
    lines.push(
      `- Consultas huérfanas excluidas (${report.consultasExcludedOrphans.length}):`,
    );
    for (const o of report.consultasExcludedOrphans) {
      lines.push(
        `  - NUMHISTORIA ${o.numHistoria}${o.fecha ? ` (${o.fecha})` : ''}`,
      );
    }
  }
  if (report.unmappedEntidadWarnings.size > 0) {
    lines.push(
      `- ENTIDAD sin correspondencia en el catálogo importado (se dejó insurance_entity_id = null): ${[...report.unmappedEntidadWarnings].join(', ')}`,
    );
  }
  if (report.consultasFallbackMotivo.length > 0) {
    lines.push(
      `- Filas sin MOTIVO en origen, insertadas con texto de relleno (${report.consultasFallbackMotivo.length} filas, índice: ${report.consultasFallbackMotivo.join(', ')})`,
    );
  }
  lines.push('');

  console.log(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dataSource = await migrationDataSource.initialize();
  try {
    const tenantId = await resolveTenantId(dataSource, TENANT_NAME);
    const report = createReport(tenantId, TENANT_NAME);

    await ensureDoctors(dataSource, tenantId, report);

    const entidadRows = readSheet<EntidadRow>(ENTIDADES_PATH!);
    const entityNameToId = await importEntidades(
      dataSource,
      tenantId,
      entidadRows,
      report,
    );

    const pacienteRows = readSheet<PacienteRow>(PACIENTES_PATH!);
    const legacyIdToPatientId = await importPacientes(
      dataSource,
      tenantId,
      pacienteRows,
      entityNameToId,
      report,
    );

    const consultaRows = readSheet<ConsultaRow>(CONSULTAS_PATH!);
    await importConsultas(
      dataSource,
      tenantId,
      consultaRows,
      legacyIdToPatientId,
      entityNameToId,
      report,
    );

    printReport(report);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
