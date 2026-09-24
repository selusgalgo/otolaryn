import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'patients' })
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ name: 'document_id', type: 'text', nullable: true })
  documentId: string | null;

  @Column({ name: 'date_of_birth', type: 'date' })
  dateOfBirth: string;

  @Column()
  phone: string;

  @Column({ name: 'phone2', type: 'text', nullable: true })
  phone2: string | null;

  @Column({ type: 'text', nullable: true })
  email: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'text', nullable: true })
  city: string | null;

  @Column({ type: 'text', nullable: true })
  province: string | null;

  @Column({ name: 'postal_code', type: 'text', nullable: true })
  postalCode: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // "Número de historia" — originally NUMHISTORIA from the legacy
  // OTOLARYN desktop app, set only for patients brought in by the
  // historical data migration. Since 24/09/2026 (PatientsService.create,
  // PatientNumberCounters1734700000000) it's also auto-assigned for every
  // new patient created directly in the app, continuing the SAME per-tenant
  // sequence — nullable is now only a historical leftover for patients
  // created before that date, not a "legacy-only" marker.
  @Column({ name: 'legacy_id', type: 'text', nullable: true })
  legacyId: string | null;

  @Column({ name: 'insurance_entity_id', type: 'uuid', nullable: true })
  insuranceEntityId: string | null;

  // PROFESION from the legacy app.
  @Column({ type: 'text', nullable: true })
  profession: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
