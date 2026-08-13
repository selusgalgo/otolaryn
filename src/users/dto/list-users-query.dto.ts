import { IsIn, IsOptional } from 'class-validator';
import type { UserRole } from '../../iam/entities/user.entity';
import { ASSIGNABLE_ROLES } from './create-user.dto';

export class ListUsersQueryDto {
  // Used by the appointment form to populate the practitioner picker
  // (?role=profesional), and generally by the /users admin screen to
  // filter by role.
  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES)
  role?: UserRole;
}
