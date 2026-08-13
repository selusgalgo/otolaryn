import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

// Creates a clinic and its first user (always 'admin') in one call — a
// brand-new tenant with no admin would be a dead end nobody could log into.
export class CreateTenantDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsEmail()
  adminEmail: string;

  @IsString()
  @MaxLength(100)
  adminFirstName: string;

  @IsString()
  @MaxLength(100)
  adminLastName: string;

  @IsString()
  @MinLength(8)
  adminPassword: string;
}
