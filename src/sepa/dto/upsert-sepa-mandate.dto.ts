import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { spanishMessage } from '../../shared/validation-messages.util';
import { SepaDebtorDto } from './sepa-debtor.dto';
import { trim } from './sepa-dto.helpers';

const AMOUNT_MESSAGE = spanishMessage(
  'La cuota mensual debe ser un importe mayor que 0, con 2 decimales como máximo',
);
const IVA_MESSAGE = spanishMessage(
  'El IVA debe ser un porcentaje entre 0 y 100',
);
const IRPF_MESSAGE = spanishMessage(
  'La retención de IRPF debe ser un porcentaje entre 0 y 100',
);
const DATE_MESSAGE = spanishMessage('La fecha del primer cargo no es válida');

// What the superadmin saves: the commercial terms (required) plus, optionally,
// any of the debtor's data — normally left for the client to fill in through
// the signing link. Create-or-replace: a clinic has exactly one mandate and
// the panel always sends the whole form. The reference is never part of the
// payload — it's assigned once on creation (see SepaService.upsertMandate).
export class UpsertSepaMandateDto extends PartialType(SepaDebtorDto) {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  clinicName: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  planName: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: AMOUNT_MESSAGE })
  @Min(0.01, { message: AMOUNT_MESSAGE })
  @Max(99_999_999, { message: AMOUNT_MESSAGE })
  monthlyBase: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: IVA_MESSAGE })
  @Min(0, { message: IVA_MESSAGE })
  @Max(100, { message: IVA_MESSAGE })
  vatPercent: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: IRPF_MESSAGE })
  @Min(0, { message: IRPF_MESSAGE })
  @Max(100, { message: IRPF_MESSAGE })
  irpfPercent: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  @IsDateString({ strict: true }, { message: DATE_MESSAGE })
  firstChargeDate: string;
}
