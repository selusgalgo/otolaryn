import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

// All fields optional — a caller sends only what it's changing. Same
// limits as CreateClinicalEntryDto; chiefComplaint keeps MinLength(1) so
// an edit can't blank out the one field every entry requires.
export class UpdateClinicalEntryDto {
  @IsOptional()
  @IsDateString()
  visitDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
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
