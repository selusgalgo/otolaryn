import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

interface JwtPayload {
  sub: string;
  tenant_id: string | null;
  role: string;
  first_name: string;
  last_name: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
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
    });
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
  async validate(payload: JwtPayload) {
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user || !user.active) {
      throw new UnauthorizedException();
    }

    return {
      userId: payload.sub,
      tenantId: payload.tenant_id,
      role: payload.role,
      firstName: payload.first_name,
      lastName: payload.last_name,
      agendaAccess: user.agendaAccess,
    };
  }
}
