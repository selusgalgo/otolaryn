import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { AuthErrorCode } from './auth-error-codes';
import { enforceDeviceLock } from './device-lock.util';
import {
  DEFAULT_SESSION_MAX_HOURS,
  effectiveSessionEnd,
  isSessionOver,
} from './session-limits';
import { Tenant } from './entities/tenant.entity';
import { User } from './entities/user.entity';

interface JwtPayload {
  sub: string;
  tenant_id: string | null;
  role: string;
  first_name: string;
  last_name: string;
  session_end?: number;
  iat?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly sessionMaxHours: number;

  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      // Not currently exploitable (jsonwebtoken already restricts to HS*
      // when secretOrKey is a plain string), but pin it explicitly rather
      // than rely on that implicit default surviving a future change (e.g.
      // switching to RS256 keys without updating this).
      algorithms: ['HS256'],
      // Needed so validate() below can read the X-Device-Token header —
      // the device-lock re-check (see enforceDeviceLock) has to run on
      // every request, not just at login, so an admin turning the lock
      // on/off or regenerating the credential takes effect immediately.
      passReqToCallback: true,
    });
    this.sessionMaxHours = Number(
      config.get('SESSION_MAX_HOURS', DEFAULT_SESSION_MAX_HOURS),
    );
  }

  // Runs only after passport-jwt has already verified the signature and
  // expiry — a tampered or expired token never reaches here. The payload
  // alone used to be enough, but it carries no notion of "still active":
  // a token signed before an admin deactivates someone (or deletes them
  // outright) would otherwise keep working until it naturally expires
  // (JWT_EXPIRES_IN, 1h by default) — far too long a window for an
  // account that just lost its job at the clinic. One extra lookup by id
  // per authenticated request is a small, well-known price for that
  // guarantee; iam.users is tiny and this is a PK lookup.
  //
  // role and tenantId come from that same freshly loaded row, not from the
  // token: otherwise a user an admin demotes keeps the old role's routes
  // (and, demoted to profesional, skips the device lock) until the token
  // expires — the same stale-claim window as deactivation above.
  async validate(req: Request, payload: JwtPayload) {
    // Techo absoluto de la sesión (ver session-limits.ts): un token que sigue
    // sin caducar pero cuya sesión ya agotó su tiempo máximo no vale.
    const sessionEnd = effectiveSessionEnd(
      payload.session_end,
      payload.iat,
      this.sessionMaxHours,
    );
    if (isSessionOver(sessionEnd, Math.floor(Date.now() / 1000))) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
        code: AuthErrorCode.SessionExpired,
      });
    }

    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user || !user.active) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
        code: AuthErrorCode.AccountDisabled,
      });
    }

    if (user.tenantId) {
      const tenant = await this.tenants.findOne({
        where: { id: user.tenantId },
      });
      if (tenant) {
        const deviceToken = req.headers['x-device-token'];
        await enforceDeviceLock(
          tenant,
          user.role,
          typeof deviceToken === 'string' ? deviceToken : undefined,
        );
      }
    }

    return {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      firstName: payload.first_name,
      lastName: payload.last_name,
      agendaAccess: user.agendaAccess,
      honorific: user.honorific,
      staffFunction: user.staffFunction,
      sessionEnd,
    };
  }
}
