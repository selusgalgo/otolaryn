import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthErrorCode } from './auth-error-codes';
import { enforceDeviceLock } from './device-lock.util';

async function codeOf(promise: Promise<void>): Promise<unknown> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(UnauthorizedException);
    return (e as UnauthorizedException).getResponse();
  }
  throw new Error('no lanzó');
}

describe('enforceDeviceLock', () => {
  let tenant: { deviceLockEnabled: boolean; deviceSecretHash: string | null };

  beforeAll(async () => {
    tenant = {
      deviceLockEnabled: true,
      deviceSecretHash: await argon2.hash('token-vigente'),
    };
  });

  it('deja pasar al profesional con la credencial vigente', async () => {
    await expect(
      enforceDeviceLock(tenant, 'profesional', 'token-vigente'),
    ).resolves.toBeUndefined();
  });

  it('sin credencial instalada responde DEVICE_LOCKED', async () => {
    const res = await codeOf(
      enforceDeviceLock(tenant, 'profesional', undefined),
    );
    expect(res).toMatchObject({ code: AuthErrorCode.DeviceLocked });
  });

  it('con una credencial que ya no vale responde DEVICE_CREDENTIAL_INVALID', async () => {
    const res = await codeOf(
      enforceDeviceLock(tenant, 'profesional', 'token-antiguo'),
    );
    expect(res).toMatchObject({
      code: AuthErrorCode.DeviceCredentialInvalid,
      message: expect.stringContaining('ya no es válida') as unknown,
    });
  });

  it('un hash corrupto se trata como credencial inválida, no como error 500', async () => {
    const res = await codeOf(
      enforceDeviceLock(
        { deviceLockEnabled: true, deviceSecretHash: 'no-es-un-hash' },
        'profesional',
        'cualquiera',
      ),
    );
    expect(res).toMatchObject({ code: AuthErrorCode.DeviceCredentialInvalid });
  });

  it('no afecta a otros roles ni al bloqueo desactivado o sin credencial', async () => {
    await expect(
      enforceDeviceLock(tenant, 'admin', undefined),
    ).resolves.toBeUndefined();
    await expect(
      enforceDeviceLock(tenant, 'recepcion', 'x'),
    ).resolves.toBeUndefined();
    await expect(
      enforceDeviceLock(
        { ...tenant, deviceLockEnabled: false },
        'profesional',
        undefined,
      ),
    ).resolves.toBeUndefined();
    await expect(
      enforceDeviceLock(
        { ...tenant, deviceSecretHash: null },
        'profesional',
        undefined,
      ),
    ).resolves.toBeUndefined();
  });
});
