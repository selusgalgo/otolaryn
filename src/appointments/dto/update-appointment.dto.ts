import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional } from 'class-validator';
import type { AppointmentStatus } from '../entities/appointment.entity';
import { CreateAppointmentDto } from './create-appointment.dto';

const STATUSES: AppointmentStatus[] = [
  'scheduled',
  'completed',
  'cancelled',
  'no_show',
];

export class UpdateAppointmentDto extends PartialType(CreateAppointmentDto) {
  @IsOptional()
  @IsIn(STATUSES)
  status?: AppointmentStatus;
}
