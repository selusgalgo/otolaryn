import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ExportPatientsQueryDto {
  @IsIn(['csv', 'xlsx'])
  format: 'csv' | 'xlsx';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
