import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { StaffFunction, UserRole } from '../../iam/entities/user.entity';

// superadmin is deliberately excluded — that role is never created through
// a tenant-scoped endpoint, only via seeding or a platform-level flow.
export const ASSIGNABLE_ROLES: UserRole[] = [
  'admin',
  'profesional',
  'recepcion',
];

export const STAFF_FUNCTIONS: StaffFunction[] = ['profesional', 'recepcion'];

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

  // Only applied when role is 'admin' (see UsersService.create) — sent for
  // any other role, it's silently ignored rather than rejected, so the
  // frontend doesn't need to strip it before submitting. '' (the form's
  // "solo administrador" option) means none, same empty-string-clears
  // convention as username below.
  @IsOptional()
  @IsIn([...STAFF_FUNCTIONS, ''])
  staffFunction?: StaffFunction | '';
}
