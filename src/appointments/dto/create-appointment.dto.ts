import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsDateString()
  scheduledAt: string;

  // No `= 30` class-property default here on purpose: UpdateAppointmentDto
  // extends this via PartialType, and class-transformer fills in class
  // defaults for properties absent from the incoming payload — so a PATCH
  // that only sends { status: 'cancelled' } would silently overwrite
  // durationMinutes back to 30 on every partial update. The actual create
  // default lives in AppointmentsService.create() (`dto.durationMinutes
  // ?? 30`), which only applies when the field is truly absent.
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes?: number;

  @IsOptional()
  @IsUUID()
  practitionerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
