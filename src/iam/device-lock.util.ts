import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthErrorCode } from './auth-error-codes';
import { Tenant } from './entities/tenant.entity';

const DEVICE_LOCKED_MESSAGE =
  'Este dispositivo no está autorizado para acceder a la aplicación. Contacta con el administrador de la clínica.';

const DEVICE_CREDENTIAL_INVALID_MESSAGE =
  'La credencial de este ordenador ya no es válida: el administrador de la clínica ha generado una nueva. Pídele el enlace de instalación actualizado y ábrelo en este ordenador.';

function deviceLocked(): UnauthorizedException {
  return new UnauthorizedException({
    statusCode: 401,
    message: DEVICE_LOCKED_MESSAGE,
    error: 'Unauthorized',
    code: AuthErrorCode.DeviceLocked,
  });
}

function deviceCredentialInvalid(): UnauthorizedException {
  return new UnauthorizedException({
    statusCode: 401,
    message: DEVICE_CREDENTIAL_INVALID_MESSAGE,
    error: 'Unauthorized',
    code: AuthErrorCode.DeviceCredentialInvalid,
  });
}

// Shared by AuthService.login (before issuing a JWT) and JwtStrategy.validate
// (on every subsequent authenticated request, so a revoked/regenerated
// credential — or the admin flipping the toggle off — takes effect
// immediately, the same live-recheck pattern already used for
// user.active/agendaAccess). Only ever enforced for role 'profesional' —
// admin and recepcion are never restricted by this, by design. Guards
// against lockout explicitly: a tenant with deviceLockEnabled but no
// deviceSecretHash yet (toggle flipped on, credential not generated) is
// treated as not actually locked.
export async function enforceDeviceLock(
  tenant: Pick<Tenant, 'deviceLockEnabled' | 'deviceSecretHash'>,
  role: string,
  deviceToken: string | undefined,
): Promise<void> {
  if (role !== 'profesional') return;
  if (!tenant.deviceLockEnabled || !tenant.deviceSecretHash) return;

  if (!deviceToken) {
    throw deviceLocked();
  }

  // Un hash corrupto hace que verify lance en vez de devolver false: se
  // trata igual que una credencial que no coincide.
  const matches = await argon2
    .verify(tenant.deviceSecretHash, deviceToken)
    .catch(() => false);
  if (!matches) {
    throw deviceCredentialInvalid();
  }
}
