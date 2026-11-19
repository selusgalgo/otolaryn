import { IsString, MaxLength, MinLength } from 'class-validator';

export class RestoreBackupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  confirmation: string;
}
