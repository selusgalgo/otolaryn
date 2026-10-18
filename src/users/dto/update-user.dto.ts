import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { StaffFunction, UserRole } from '../../iam/entities/user.entity';
import { ASSIGNABLE_ROLES, STAFF_FUNCTIONS } from './create-user.dto';

// All fields optional — a caller sends only what it's changing.
export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  // Empty string clears it (same convention as AccountService.updateProfile)
  // — a bare @IsOptional() lets "" through since undefined is what's
  // actually optional, not falsy values.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  username?: string;

  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES)
  role?: UserRole;

  // Same '' = "solo administrador" convention as CreateUserDto.
  @IsOptional()
  @IsIn([...STAFF_FUNCTIONS, ''])
  staffFunction?: StaffFunction | '';
}
