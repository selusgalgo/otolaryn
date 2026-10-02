import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { AntecedenteCategory } from '../entities/antecedente-type.entity';

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
// current state" shape as UpdateScheduleDto/ScheduleForm. Scoped to one
// replace per request, not the patient's whole antecedentes list: with two
// independent widgets (Antecedentes personales / familiares), each with its
// own Guardar, replacing everything on either save would wipe out whatever
// the other widget already had marked.
export class UpdatePatientAntecedentesDto {
  // Optional for backward compatibility with any caller that predates the
  // personal/familiar split: omitting it keeps the old "replace the
  // patient's entire antecedentes list, any category" behaviour. Both
  // PatientAntecedentesCard widgets always send it.
  @IsOptional()
  @IsIn(['personal', 'familiar'])
  category?: AntecedenteCategory;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PatientAntecedenteItemDto)
  items: PatientAntecedenteItemDto[];
}
