import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  compact,
  IsSepaCreditorId,
  IsSpanishTaxId,
  trim,
  trimToNull,
  EMAIL_MESSAGE,
  POSTAL_CODE_MESSAGE,
} from './sepa-dto.helpers';

export class UpdateCreditorProfileDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @Transform(compact)
  @IsSpanishTaxId('Acreedor')
  taxId: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  address: string;

  @Transform(trim)
  @Matches(/^\d{5}$/, { message: POSTAL_CODE_MESSAGE })
  postalCode: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  province: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  country: string;

  @Transform(trim)
  @IsEmail({}, { message: EMAIL_MESSAGE })
  email: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  phone: string;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(200)
  website: string | null;

  @Transform(compact)
  @IsSepaCreditorId()
  sepaCreditorId: string;
}
