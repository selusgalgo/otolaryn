import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../iam/jwt-auth.guard';
import { RolesGuard } from '../iam/roles.guard';
import { BackupConfigurationService } from './backup-configuration.service';
import { BackupsController } from './backups.controller';

describe('backup configuration authorization', () => {
  let app: INestApplication;
  const save = jest.fn().mockResolvedValue({ configured: true });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BackupsController],
      providers: [
        RolesGuard,
        {
          provide: BackupConfigurationService,
          useValue: { save, connection: jest.fn() },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => {
            getRequest: () => {
              headers: Record<string, string>;
              user?: unknown;
            };
          };
        }) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { userId: 'user-id', role: req.headers['x-test-role'] };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => save.mockClear());

  const payload = {
    bucket: 'private-backups',
    region: 'eu-central-003',
    keyId: 'test-key-id',
    applicationKey: 'test-key',
  };
  it('blocks tenant administrators from configuring the bucket', async () => {
    await request(app.getHttpServer())
      .put('/platform/backups/configuration')
      .set('x-test-role', 'admin')
      .send(payload)
      .expect(403);
    expect(save).not.toHaveBeenCalled();
  });
  it('blocks invalid endpoints and extra fields before saving', async () => {
    await request(app.getHttpServer())
      .put('/platform/backups/configuration')
      .set('x-test-role', 'superadmin')
      .send({ ...payload, region: 'evil.example.com' })
      .expect(400);
    await request(app.getHttpServer())
      .put('/platform/backups/configuration')
      .set('x-test-role', 'superadmin')
      .send({ ...payload, endpoint: 'https://example.com' })
      .expect(400);
    expect(save).not.toHaveBeenCalled();
  });
  it('passes validated configuration and authenticated actor to the service', async () => {
    await request(app.getHttpServer())
      .put('/platform/backups/configuration')
      .set('x-test-role', 'superadmin')
      .send(payload)
      .expect(200);
    expect(save).toHaveBeenCalledWith(payload, 'user-id');
  });
});
