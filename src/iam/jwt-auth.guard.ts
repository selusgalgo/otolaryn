import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthErrorCode } from './auth-error-codes';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Passport colapsa todos los fallos de autenticación en un 401 genérico.
  // Aquí se les añade un `code` para que el cliente sepa si la sesión simplemente
  // caducó (volver a entrar basta) o es otra cosa. Un error lanzado por
  // JwtStrategy.validate() (dispositivo bloqueado, cuenta desactivada) llega
  // como `err` ya con su propio código: se relanza tal cual.
  handleRequest<TUser>(err: unknown, user: TUser | false, info: unknown): TUser {
    if (err) {
      throw err;
    }
    if (!user) {
      const name = (info as { name?: string } | undefined)?.name;
      const message = (info as { message?: string } | undefined)?.message;
      // "No auth token": sin cabecera Authorization, que es lo que ve la API
      // cuando la cookie de sesión del frontend ya expiró.
      const ended = name === 'TokenExpiredError' || message === 'No auth token';
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
        code: ended ? AuthErrorCode.SessionExpired : AuthErrorCode.TokenInvalid,
      });
    }
    return user;
  }
}
