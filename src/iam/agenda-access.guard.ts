import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from './entities/user.entity';

interface AuthenticatedRequest {
  user?: { role: UserRole; agendaAccess: boolean };
}

// Admin-controlled, per-profesional toggle: a doctor an admin has turned
// this off for loses the Agenda module entirely (can't list, book, or
// edit a cita), while still keeping every other profesional capability.
// Meaningless for admin/recepcion — always true for them — so this only
// ever blocks role === 'profesional'. Must run after JwtAuthGuard (reads
// request.user, which only JwtStrategy.validate() populates, freshly
// re-checked from the DB on every request — same reasoning as `active`,
// see that guard's comment).
@Injectable()
export class AgendaAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (user?.role === 'profesional' && !user.agendaAccess) {
      throw new ForbiddenException('No tienes acceso a la Agenda');
    }

    return true;
  }
}
