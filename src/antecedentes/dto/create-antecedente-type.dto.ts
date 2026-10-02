import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { AntecedenteCategory } from '../entities/antecedente-type.entity';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateAntecedenteTypeDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  // Optional, not required: defaults to 'personal' in the service so every
  // caller that predates the personal/familiar split (including the
  // existing e2e suite) keeps working unchanged.
  @IsOptional()
  @IsIn(['personal', 'familiar'])
  category?: AntecedenteCategory;
}
