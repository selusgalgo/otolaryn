import { createParamDecorator, ExecutionContext } from '@nestjs/common';

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
