import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

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

  // Campos de la plantilla de cirugía (ver consultation-template.ts).
  // evolution/report son rich text, con el mismo margen para el HTML que
  // examinationFindings.
  @IsOptional()
  @IsString()
  @MaxLength(12000)
  evolution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  report?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  referringDoctor?: string;
}
