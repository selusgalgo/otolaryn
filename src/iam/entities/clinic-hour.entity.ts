import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// One row per open time slot — a day with no rows is closed. Weekly
// recurring, whole-clinic (not per practitioner). Index 0=Monday..6=Sunday,
// same convention the Escritorio calendar grid already uses.
@Entity({ schema: 'iam', name: 'clinic_hours' })
export class ClinicHour {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'smallint' })
  weekday: number;

  // `time` columns come back from pg as "HH:MM:SS" strings — TypeORM does
  // not parse them into a Date, which is what we want here (no date part
  // makes sense for a recurring weekly slot).
  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;
}
