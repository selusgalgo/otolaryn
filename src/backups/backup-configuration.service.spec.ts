import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { DataSource } from 'typeorm';
import { BackupConfigurationService } from './backup-configuration.service';

jest.mock('@aws-sdk/client-s3', () => {
  class Command {
    constructor(readonly input: Record<string, unknown>) {}
  }
  return {
    S3Client: jest.fn(),
    ListObjectsV2Command: class ListObjectsV2Command extends Command {},
    PutObjectCommand: class PutObjectCommand extends Command {},
    GetObjectCommand: class GetObjectCommand extends Command {},
    DeleteObjectCommand: class DeleteObjectCommand extends Command {},
  };
});

// Fake bucket: GetObject returns whatever PutObject stored under the same key,
// so the write/read-back connection check behaves like a real bucket.
const fakeBucket = (objects = new Map<string, Buffer>()) =>
  jest.fn((command: { input: { Key?: string; Body?: Buffer } }) => {
    if (command instanceof PutObjectCommand) {
      objects.set(command.input.Key!, Buffer.from(command.input.Body!));
    } else if (command instanceof GetObjectCommand) {
      const stored = objects.get(command.input.Key!);
      return Promise.resolve({
        Body: stored && {
          transformToByteArray: () => Promise.resolve(new Uint8Array(stored)),
        },
      });
    }
    return Promise.resolve({});
  });

describe('BackupConfigurationService', () => {
  let send: jest.Mock;
  const destroy = jest.fn();
  const query = jest.fn();
  const dto = {
    bucket: 'private-backups',
    region: 'eu-central-003',
    keyId: 'private-id',
    applicationKey: 'secret-application-key',
  };
  const service = () =>
    new BackupConfigurationService(
      { query } as unknown as DataSource,
      { getOrThrow: () => 'a-test-server-secret' } as unknown as ConfigService,
    );
  beforeEach(() => {
    jest.clearAllMocks();
    send = fakeBucket();
    (S3Client as jest.Mock).mockImplementation(() => ({ send, destroy }));
  });

  it('reports no stored configuration', async () => {
    query.mockResolvedValueOnce([]);
    expect(await service().connection()).toEqual({
      configured: false,
      connected: false,
      bucket: null,
      region: null,
    });
    expect(S3Client).not.toHaveBeenCalled();
  });

  it('stores authenticated ciphertext and returns no credentials', async () => {
    query.mockResolvedValueOnce([]);
    const result = await service().save(dto, 'user-id');
    const params = query.mock.calls[0][1] as unknown[];
    expect(Buffer.isBuffer(params[2])).toBe(true);
    expect(Buffer.isBuffer(params[3])).toBe(true);
    expect((params[2] as Buffer).toString()).not.toContain(dto.keyId);
    expect((params[3] as Buffer).toString()).not.toContain(dto.applicationKey);
    expect(JSON.stringify(result)).not.toContain(dto.applicationKey);
    expect(destroy).toHaveBeenCalled();
    query.mockResolvedValueOnce([
      {
        bucket: dto.bucket,
        region: dto.region,
        key_id_encrypted: params[2],
        application_key_encrypted: params[3],
      },
    ]);
    expect((await service().connection()).connected).toBe(true);
  });

  it('does not replace existing credentials if connection fails', async () => {
    send.mockRejectedValueOnce(new Error('sensitive provider error'));
    await expect(service().save(dto, 'user-id')).rejects.toThrow(
      'No se ha podido conectar',
    );
    expect(query).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });

  it('does not save credentials when the bucket returns different content', async () => {
    send = fakeBucket({
      set: () => undefined,
      get: () => Buffer.from('tampered'),
    } as unknown as Map<string, Buffer>);
    await expect(service().save(dto, 'user-id')).rejects.toThrow(
      'No se ha podido conectar',
    );
    expect(query).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });

  it('treats altered ciphertext as disconnected without exposing the secret', async () => {
    query.mockResolvedValueOnce([
      {
        bucket: dto.bucket,
        region: dto.region,
        key_id_encrypted: Buffer.from('broken'),
        application_key_encrypted: Buffer.from('broken'),
      },
    ]);
    const result = await service().connection();
    expect(result.connected).toBe(false);
    expect(JSON.stringify(result)).not.toContain(dto.applicationKey);
    expect(S3Client).not.toHaveBeenCalled();
  });
});
