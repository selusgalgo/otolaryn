import { UnauthorizedException } from '@nestjs/common';
import { AuthErrorCode } from './auth-error-codes';
import { JwtAuthGuard } from './jwt-auth.guard';

function codeOf(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(UnauthorizedException);
    return (e as UnauthorizedException).getResponse();
  }
  throw new Error('no lanzó');
}

describe('JwtAuthGuard.handleRequest', () => {
  const guard = new JwtAuthGuard();

  it('deja pasar al usuario autenticado', () => {
    const user = { userId: 'u1' };
    expect(guard.handleRequest(null, user, undefined)).toBe(user);
  });

  it('marca un JWT caducado como SESSION_EXPIRED', () => {
    const res = codeOf(() =>
      guard.handleRequest(null, false, { name: 'TokenExpiredError' }),
    );
    expect(res).toMatchObject({
      statusCode: 401,
      message: 'Unauthorized',
      code: AuthErrorCode.SessionExpired,
    });
  });

  it('marca la ausencia de token como SESSION_EXPIRED', () => {
    const res = codeOf(() =>
      guard.handleRequest(null, false, new Error('No auth token')),
    );
    expect(res).toMatchObject({ code: AuthErrorCode.SessionExpired });
  });

  it('marca un JWT manipulado como TOKEN_INVALID', () => {
    const res = codeOf(() =>
      guard.handleRequest(null, false, {
        name: 'JsonWebTokenError',
        message: 'invalid signature',
      }),
    );
    expect(res).toMatchObject({ code: AuthErrorCode.TokenInvalid });
  });

  it('relanza tal cual el error de validate() (dispositivo / cuenta)', () => {
    const err = new UnauthorizedException({
      message: 'x',
      code: AuthErrorCode.DeviceLocked,
    });
    expect(() => guard.handleRequest(err, false, undefined)).toThrow(err);
  });
});
