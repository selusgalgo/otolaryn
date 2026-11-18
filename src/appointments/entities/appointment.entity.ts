import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type AppointmentStatus =
  'scheduled' | 'completed' | 'cancelled' | 'no_show';

@Entity({ name: 'appointments' })
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'patient_id' })
  patientId: string;

  @Column({ name: 'practitioner_id', type: 'uuid', nullable: true })
  practitionerId: string | null;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt: Date;

  @Column({ name: 'duration_minutes' })
  durationMinutes: number;

  @Column()
  status: AppointmentStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // Hashes are internal integration metadata, never returned in API payloads.
  @Column({
    name: 'idempotency_key_hash',
    type: 'text',
    nullable: true,
    select: false,
  })
  idempotencyKeyHash: string | null;

  @Column({
    name: 'idempotency_request_hash',
    type: 'text',
    nullable: true,
    select: false,
  })
  idempotencyRequestHash: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
