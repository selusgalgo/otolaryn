import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class PatientAntecedenteItemDto {
  @IsUUID()
  antecedenteTypeId: string;

  // Free-text nuance ("4-5 cigarrillos/día", "Alérgico al melocotón") — the
  // row's mere existence already means "marcado", this is optional detail
  // on top, exactly like the legacy data's own antecedente columns.
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  detalle?: string;
}

// Full replace, not a per-row PATCH — same "the whole form submits its
// current state" shape as UpdateScheduleDto/ScheduleForm.
export class UpdatePatientAntecedentesDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PatientAntecedenteItemDto)
  items: PatientAntecedenteItemDto[];
}
