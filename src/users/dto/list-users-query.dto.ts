import { IsIn, IsOptional } from 'class-validator';
import type { UserRole } from '../../iam/entities/user.entity';
import { ASSIGNABLE_ROLES } from './create-user.dto';

export class ListUsersQueryDto {
  // Used generally by the /users admin screen to filter by role.
  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES)
  role?: UserRole;

  // Used by the appointment form to populate the practitioner picker:
  // every 'profesional', plus any 'admin' who also practices (staffFunction
  // — an owner-doctor keeps full admin access and additionally becomes
  // bookable). Deliberately separate from `role` above, not a third value
  // it could take — an admin doesn't stop being admin by also being
  // bookable, so this can't collapse into a single role filter. Ignored
  // together with `role` if both are somehow sent; see UsersService.findAll.
  @IsOptional()
  @IsIn(['true'])
  bookable?: string;
}
