import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  compact,
  EMAIL_MESSAGE,
  IsBic,
  IsIban,
  IsSpanishTaxId,
  POSTAL_CODE_MESSAGE,
  RequiredText,
  trimToNull,
} from './sepa-dto.helpers';

// The debtor's side of the mandate: who owns the account being debited.
// Required in full when the *client* saves it through the signing link;
// UpsertSepaMandateDto makes every field optional (PartialType) because the
// superadmin may create the mandate with just the commercial terms and leave
// this for the client.
export class SepaDebtorDto {
  @Transform(trimToNull)
  @RequiredText('Nombre del titular', 200)
  holderName: string;

  @Transform(compact)
  @IsSpanishTaxId('Titular')
  holderTaxId: string;

  @Transform(trimToNull)
  @RequiredText('Persona que firma', 200)
  signerName: string;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(100)
  signerPosition: string | null;

  @Transform(trimToNull)
  @RequiredText('Dirección', 300)
  address: string;

  @Transform(trimToNull)
  @Matches(/^\d{5}$/, { message: POSTAL_CODE_MESSAGE })
  postalCode: string;

  @Transform(trimToNull)
  @RequiredText('Población', 100)
  city: string;

  @Transform(trimToNull)
  @RequiredText('Provincia', 100)
  province: string;

  @Transform(trimToNull)
  @RequiredText('País', 100)
  country: string;

  @Transform(trimToNull)
  @IsEmail({}, { message: EMAIL_MESSAGE })
  email: string;

  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(30)
  phone: string | null;

  @Transform(compact)
  @IsIban()
  iban: string;

  @IsOptional()
  @Transform(compact)
  @IsBic()
  bic: string | null;
}
