import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { isIP } from 'node:net';
import type { ClientContext } from './sepa-signing.service';
import { RateLimiter } from './sepa-signing.util';

// The public signing endpoints carry no login, so they get a cap per client
// address: 120 requests / 10 minutes covers a person filling the form,
// previewing the PDF and signing a few times over, and nothing like a
// script hammering them. See RateLimiter for why in-memory is enough here.
const limiter = new RateLimiter(120, 10 * 60 * 1000);

// The signing pages are served by Next.js, which calls this API from its own
// server and forwards the visitor's address in X-Client-IP — without it every
// visitor would look like the Next server. The header is only as trustworthy
// as the network path to this API: it's meant to be reachable by the web app
// alone, and if it isn't, the recorded address is self-declared.
export function clientContext(req: Request): ClientContext {
  const forwarded = req.headers['x-client-ip'];
  const candidate = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(',')[0]
    ?.trim();
  const ip =
    candidate && isIP(candidate)
      ? candidate
      : (req.socket.remoteAddress ?? null);
  const userAgent = req.headers['x-client-user-agent'];
  return {
    ip,
    userAgent:
      (Array.isArray(userAgent) ? userAgent[0] : userAgent) ??
      req.headers['user-agent'] ??
      null,
  };
}

@Injectable()
export class SepaRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const { ip } = clientContext(req);
    if (!limiter.allow(ip ?? 'unknown')) {
      throw new HttpException(
        'Demasiadas peticiones. Espera unos minutos e inténtalo de nuevo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
