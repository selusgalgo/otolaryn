import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  CanActivate,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from './entities/user.entity';
import { ROLES_KEY } from './roles.decorator';

interface AuthenticatedRequest {
  user?: { role: UserRole };
}

// Must run after JwtAuthGuard (it reads request.user, which only
// JwtStrategy.validate() populates) — always pair as
// @UseGuards(JwtAuthGuard, RolesGuard).
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      UserRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    // No @Roles() on this route: authentication alone is enough, matching
    // behaviour before this guard existed.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.user?.role;

    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException(
        'Your role is not allowed to access this resource',
      );
    }

    return true;
  }
}
