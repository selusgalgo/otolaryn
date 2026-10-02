import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ schema: 'iam', name: 'tenants' })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  // Schedule lives in ClinicHour (iam.clinic_hours), one row per open time
  // slot — see that entity.

  // Pre-fills a new appointment's duration (AppointmentsService.create(),
  // and the web form's own field) when the request doesn't specify one.
  // 5-480 is the same hard technical floor/ceiling CreateAppointmentDto
  // enforces on every appointment regardless of this setting — this is a
  // per-clinic default, not a replacement for that bound.
  @Column({ name: 'default_appointment_duration_minutes', type: 'smallint' })
  defaultAppointmentDurationMinutes: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
