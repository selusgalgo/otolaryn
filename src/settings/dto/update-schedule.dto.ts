import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class TimeSlotDto {
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:MM' })
  startTime: string;

  @Matches(TIME_PATTERN, { message: 'endTime must be HH:MM' })
  endTime: string;
}

export class DayScheduleDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  slots: TimeSlotDto[];
}

// Shared by SettingsController (admin, own clinic) and PlatformController
// (superadmin, any clinic) — same shape either way. Always exactly 7 days
// (0=Monday..6=Sunday); a day with an empty slots array is closed.
export class UpdateScheduleDto {
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => DayScheduleDto)
  days: DayScheduleDto[];
}
