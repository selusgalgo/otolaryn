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

  // Edited as rich text (Tiptap) — the limit covers the HTML markup
  // overhead (<p>, <strong>, ...) on top of the actual written content,
  // not just the visible character count.
  @IsString()
  @MinLength(1)
  @MaxLength(6000)
  chiefComplaint: string;

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
