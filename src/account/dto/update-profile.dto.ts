import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  // Optional and nullable-by-emptiness: an empty string means "clear my
  // username", not "leave it unset" — see AccountService.updateProfile.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  username?: string;
}
