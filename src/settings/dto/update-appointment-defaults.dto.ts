import { IsInt, Max, Min } from 'class-validator';

// Same 5-480 bounds as CreateAppointmentDto.durationMinutes — a clinic
// can't configure a default outside what an actual appointment could ever
// have anyway.
export class UpdateAppointmentDefaultsDto {
  @IsInt()
  @Min(5)
  @Max(480)
  defaultDurationMinutes: number;
}
