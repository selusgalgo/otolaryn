import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';

// NestJS's own built-in exceptions (a bare `new UnauthorizedException()`
// with no message, Passport's default auth failure, the framework's
// generic 404 for an unmatched route...) render in English by default —
// this catches every one of those specific, fixed default strings and
// swaps in the Spanish equivalent. It's deliberately narrow (an exact
// Set, not a blanket rewrite) so a message someone already wrote in
// Spanish elsewhere in the app is never touched.
const DEFAULT_MESSAGES: Record<string, string> = {
  Unauthorized: 'No autorizado',
  Forbidden: 'Acceso denegado',
  'Not Found': 'No encontrado',
  'Bad Request': 'Solicitud incorrecta',
  Conflict: 'Conflicto con el estado actual',
};

@Catch(HttpException)
export class SpanishExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();

    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = body.message;
      if (typeof message === 'string' && message in DEFAULT_MESSAGES) {
        response
          .status(status)
          .json({ ...body, message: DEFAULT_MESSAGES[message] });
        return;
      }
    }

    response.status(status).json(body);
  }
}
