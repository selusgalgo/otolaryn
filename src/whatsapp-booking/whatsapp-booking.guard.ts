import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isUUID } from 'class-validator';
import type { CurrentUserPayload } from '../iam/current-user.decorator';

// A separate, narrowly scoped credential. Missing/invalid configuration fails
// closed; the caller never supplies the tenant id or the professional allowlist.
@Injectable()
export class WhatsappBookingGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const tenantId =
      this.config.get<string>('WHATSAPP_BOOKING_TENANT_ID') ?? '';
    const digest =
      this.config.get<string>('WHATSAPP_BOOKING_TOKEN_SHA256') ?? '';
    const allowed = (
      this.config.get<string>('WHATSAPP_BOOKING_PRACTITIONERS') ?? ''
    )
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const allowedPhones = (
      this.config.get<string>('WHATSAPP_BOOKING_ALLOWED_PHONES') ?? ''
    )
      .split(',')
      .map((phone) => phone.trim())
      .filter(Boolean);
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      method: string;
      body?: { phone?: unknown };
      user?: CurrentUserPayload;
    }>();
    const authorization = request.headers.authorization ?? '';
    const match = /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(authorization);
    if (
      !isUUID(tenantId) ||
      !/^[a-f0-9]{64}$/.test(digest) ||
      !allowed.length ||
      allowed.length > 20 ||
      !allowed.every((id) => isUUID(id)) ||
      !allowedPhones.length ||
      allowedPhones.length > 20 ||
      !allowedPhones.every((phone) => /^\+[1-9]\d{7,14}$/.test(phone)) ||
      !match ||
      !timingSafeEqual(
        Buffer.from(digest, 'hex'),
        createHash('sha256').update(match[1]).digest(),
      )
    ) {
      throw new UnauthorizedException();
    }
    // Only authenticated callers learn that this particular sender is not
    // permitted. This lets n8n discard that item without hiding a bad token.
    if (
      request.method === 'POST' &&
      (typeof request.body?.phone !== 'string' ||
        !allowedPhones.includes(request.body.phone))
    ) {
      throw new ForbiddenException({
        code: 'SENDER_NOT_ALLOWED',
        message: 'Remitente no autorizado',
      });
    }
    request.user = {
      userId: '00000000-0000-4000-8000-000000000000',
      tenantId,
      role: 'recepcion',
      firstName: 'Integración',
      lastName: 'WhatsApp',
      agendaAccess: true,
      honorific: 'Dr.',
      staffFunction: null,
    };
    return true;
  }
}
