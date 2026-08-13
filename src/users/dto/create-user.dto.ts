import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { UserRole } from '../../iam/entities/user.entity';

// superadmin is deliberately excluded — that role is never created through
// a tenant-scoped endpoint, only via seeding or a platform-level flow.
export const ASSIGNABLE_ROLES: UserRole[] = [
  'admin',
  'profesional',
  'recepcion',
];

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MaxLength(100)
  lastName: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsIn(ASSIGNABLE_ROLES)
  role: UserRole;
}
