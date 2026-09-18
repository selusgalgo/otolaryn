import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

export type PatientSortBy = 'name' | 'dateOfBirth';
export type SortDirection = 'asc' | 'desc';

export class ListPatientsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @IsOptional()
  @IsIn(['name', 'dateOfBirth'])
  sortBy?: PatientSortBy;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: SortDirection;
}
