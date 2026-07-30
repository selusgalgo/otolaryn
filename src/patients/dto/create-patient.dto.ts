import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

// Trims whitespace before validation/storage. Without this, " 00000002B"
// and "00000002B" are different strings as far as the documentId unique
// index is concerned — a stray leading/trailing space (easy to fat-finger,
// or pasted in from somewhere) silently defeats the "no duplicate patient"
// guarantee. Found by the user creating a patient that looked identical to
// an existing one.
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePatientDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  documentId: string;

  @IsDateString()
  dateOfBirth: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  phone: string;

  @IsOptional()
  @Transform(trim)
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
