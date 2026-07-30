import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateClinicalEntryDto {
  @IsOptional()
  @IsDateString()
  visitDate?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  chiefComplaint: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  examinationFindings?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  diagnosis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  treatment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  followUpNotes?: string;
}
