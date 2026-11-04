import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Honorific, StaffFunction } from './entities/user.entity';

export interface CurrentUserPayload {
  userId: string;
  // Null only for 'superadmin' — see User entity comment.
  tenantId: string | null;
  role: string;
  firstName: string;
  lastName: string;
  // Re-fetched from the DB on every request by JwtStrategy.validate (same
  // query as the `active` check) — never trust a stale copy of this from
  // anywhere else, an admin flipping it needs to take effect immediately,
  // not at the profesional's next login.
  agendaAccess: boolean;
  // Cómo se antepone el nombre de un médico ("Dr."/"Dra.") y su función
  // adicional si es administrador: con ellos la web decide, sin otra consulta,
  // si el usuario actual ejerce como médico y cómo mostrar su nombre.
  honorific: Honorific;
  staffFunction: StaffFunction | null;
  // Fin absoluto de la sesión (segundos epoch), ver session-limits.ts.
  sessionEnd?: number;
}

// Pulls the object JwtStrategy.validate() attached as request.user, so
// controllers never touch the raw request to find out who's calling.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: CurrentUserPayload }>();
    return request.user;
  },
);
