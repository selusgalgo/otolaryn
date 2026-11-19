import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class BackupConfigurationDto {
  @IsString()
  @MinLength(6)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/)
  bucket: string;

  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)+$/)
  region: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  @Matches(/^\S+$/)
  keyId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  @Matches(/^\S+$/)
  applicationKey: string;
}
