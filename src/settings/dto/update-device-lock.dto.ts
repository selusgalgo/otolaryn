import { IsBoolean } from 'class-validator';

export class UpdateDeviceLockDto {
  @IsBoolean()
  enabled: boolean;
}
