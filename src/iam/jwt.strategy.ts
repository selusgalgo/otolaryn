import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface JwtPayload {
  sub: string;
  tenant_id: string;
  role: string;
  first_name: string;
  last_name: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
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
  // expiry — a tampered or expired token never reaches here.
  validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      tenantId: payload.tenant_id,
      role: payload.role,
      firstName: payload.first_name,
      lastName: payload.last_name,
    };
  }
}
