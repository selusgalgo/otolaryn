import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
} from 'class-validator';

// Shared by SettingsController (admin, own clinic) and PlatformController
// (superadmin, any clinic) — same shape either way. Index 0=Monday..6=Sunday.
export class UpdateScheduleDto {
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @IsBoolean({ each: true })
  openDays: boolean[];
}
