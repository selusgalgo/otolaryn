import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { UserRole } from '../../iam/entities/user.entity';
import { ASSIGNABLE_ROLES } from './create-user.dto';

// All fields optional — a caller sends only what it's changing. Email is
// deliberately not editable here (same call as Mi cuenta's own profile
// form): it's the account's original identifier, changing it is a bigger
// decision than fixing a typo in a name.
export class UpdateUserDto {
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
}
