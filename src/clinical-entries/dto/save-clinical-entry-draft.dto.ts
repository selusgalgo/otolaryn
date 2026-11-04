import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

// Todos los campos son opcionales y chiefComplaint puede ir vacío: un borrador
// se guarda mientras se escribe, así que no se le exige lo que sí exige firmar
// la consulta (CreateClinicalEntryDto). Los topes de longitud son los mismos.
export class SaveClinicalEntryDraftDto {
  @IsOptional()
  @IsDateString()
  visitDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(6000)
  chiefComplaint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  examinationFindings?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  diagnosis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(6000)
  treatment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  followUpNotes?: string;
}
