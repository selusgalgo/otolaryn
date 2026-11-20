import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { DataSource } from 'typeorm';
import { BackupConfigurationService } from './backup-configuration.service';

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  ListObjectsV2Command: jest.fn(),
}));

describe('BackupConfigurationService', () => {
  const send = jest.fn();
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
    (S3Client as jest.Mock).mockImplementation(() => ({ send, destroy }));
    send.mockResolvedValue({});
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
