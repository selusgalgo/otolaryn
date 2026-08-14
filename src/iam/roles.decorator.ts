import { SetMetadata } from '@nestjs/common';
import { UserRole } from './entities/user.entity';

export const ROLES_KEY = 'roles';

// Marks a route as restricted to the given roles. With no @Roles() at all,
// RolesGuard lets any authenticated user through — same as today's
// behaviour (JwtAuthGuard alone only checks "is authenticated").
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
