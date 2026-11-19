import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { hkdfSync, randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { decryptSecret, encryptSecret } from '../pdf/secret-box.util';
import { BackupConfigurationDto } from './backup-configuration.dto';

interface StoredConfiguration {
  bucket: string;
  region: string;
  key_id_encrypted: Buffer;
  application_key_encrypted: Buffer;
}

@Injectable()
export class BackupConfigurationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  private encryptionKey(): Buffer {
    return Buffer.from(
      hkdfSync(
        'sha256',
        this.config.getOrThrow<string>('JWT_SECRET'),
        'mederi-backup-configuration',
        'b2-credentials-v1',
        32,
      ),
    );
  }

  private async load(): Promise<StoredConfiguration | undefined> {
    const rows = (await this.dataSource.query(
      'SELECT bucket, region, key_id_encrypted, application_key_encrypted FROM iam.backup_configuration WHERE id = 1',
    )) as StoredConfiguration[];
    return rows[0];
  }

  private async testConnection(
    settings: BackupConfigurationDto,
  ): Promise<boolean> {
    const client = this.createClient(settings);
    const key = `mederi-backup-connection-check/${randomBytes(16).toString('hex')}`;
    const marker = randomBytes(16);
    let uploaded = false;
    try {
      await client.send(
        new ListObjectsV2Command({ Bucket: settings.bucket, MaxKeys: 1 }),
      );
      await client.send(
        new PutObjectCommand({
          Bucket: settings.bucket,
          Key: key,
          Body: marker,
          ContentType: 'application/octet-stream',
        }),
      );
      uploaded = true;
      const response = await client.send(
        new GetObjectCommand({ Bucket: settings.bucket, Key: key }),
      );
      const readBack = await response.Body?.transformToByteArray();
      if (!readBack || !Buffer.from(readBack).equals(marker)) return false;
      await client.send(
        new DeleteObjectCommand({ Bucket: settings.bucket, Key: key }),
      );
      uploaded = false;
      return true;
    } catch {
      return false;
    } finally {
      if (uploaded)
        await client
          .send(new DeleteObjectCommand({ Bucket: settings.bucket, Key: key }))
          .catch(() => undefined);
      client.destroy();
    }
  }

  private createClient(settings: BackupConfigurationDto): S3Client {
    return new S3Client({
      endpoint: `https://s3.${settings.region}.backblazeb2.com`,
      region: settings.region,
      credentials: {
        accessKeyId: settings.keyId,
        secretAccessKey: settings.applicationKey,
      },
      requestHandler: { connectionTimeout: 5000, requestTimeout: 10000 },
      maxAttempts: 1,
    });
  }

  private async testReadConnection(
    settings: BackupConfigurationDto,
  ): Promise<boolean> {
    const client = this.createClient(settings);
    try {
      await client.send(
        new ListObjectsV2Command({ Bucket: settings.bucket, MaxKeys: 1 }),
      );
      return true;
    } catch {
      return false;
    } finally {
      client.destroy();
    }
  }

  async connection() {
    const row = await this.load();
    if (!row)
      return {
        configured: false,
        connected: false,
        bucket: null,
        region: null,
      };
    let connected = false;
    try {
      const key = this.encryptionKey();
      connected = await this.testReadConnection({
        bucket: row.bucket,
        region: row.region,
        keyId: decryptSecret(row.key_id_encrypted, key, 'b2:key-id').toString(),
        applicationKey: decryptSecret(
          row.application_key_encrypted,
          key,
          'b2:application-key',
        ).toString(),
      });
    } catch {
      // Credential or encryption-key errors must not leak secret material.
    }
    return {
      configured: true,
      connected,
      bucket: row.bucket,
      region: row.region,
    };
  }

  async hasConfiguration(): Promise<boolean> {
    return Boolean(await this.load());
  }

  async openClient(): Promise<{ client: S3Client; bucket: string }> {
    const row = await this.load();
    if (!row)
      throw new BadRequestException(
        'Configura primero la conexión con Backblaze B2.',
      );
    const key = this.encryptionKey();
    const keyId = decryptSecret(
      row.key_id_encrypted,
      key,
      'b2:key-id',
    ).toString();
    const applicationKey = decryptSecret(
      row.application_key_encrypted,
      key,
      'b2:application-key',
    ).toString();
    return {
      bucket: row.bucket,
      client: new S3Client({
        endpoint: `https://s3.${row.region}.backblazeb2.com`,
        region: row.region,
        credentials: { accessKeyId: keyId, secretAccessKey: applicationKey },
        requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 },
        maxAttempts: 2,
      }),
    };
  }

  archiveKeyMaterial(): { encryptionKey: Buffer; authenticationKey: Buffer } {
    const material = Buffer.from(
      hkdfSync(
        'sha512',
        this.config.getOrThrow<string>('JWT_SECRET'),
        'mederi-backup-archive',
        'archive-encryption-and-authentication-v1',
        64,
      ),
    );
    return {
      encryptionKey: material.subarray(0, 32),
      authenticationKey: material.subarray(32),
    };
  }

  async save(dto: BackupConfigurationDto, userId: string) {
    if (!(await this.testConnection(dto))) {
      throw new BadRequestException(
        'No se ha podido conectar al bucket. Comprueba la región, las claves y el permiso para listar archivos.',
      );
    }
    const key = this.encryptionKey();
    const keyId = encryptSecret(Buffer.from(dto.keyId), key, 'b2:key-id');
    const applicationKey = encryptSecret(
      Buffer.from(dto.applicationKey),
      key,
      'b2:application-key',
    );
    await this.dataSource.query(
      `INSERT INTO iam.backup_configuration
      (id, bucket, region, key_id_encrypted, application_key_encrypted, updated_by)
      VALUES (1, $1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET bucket = EXCLUDED.bucket, region = EXCLUDED.region,
        key_id_encrypted = EXCLUDED.key_id_encrypted, application_key_encrypted = EXCLUDED.application_key_encrypted,
        updated_at = now(), updated_by = EXCLUDED.updated_by`,
      [dto.bucket, dto.region, keyId, applicationKey, userId],
    );
    return {
      configured: true,
      connected: true,
      bucket: dto.bucket,
      region: dto.region,
    };
  }
}
