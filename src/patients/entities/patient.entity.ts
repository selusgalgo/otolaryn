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

  @Column({ name: 'document_id' })
  documentId: string;

  @Column({ name: 'date_of_birth', type: 'date' })
  dateOfBirth: string;

  @Column()
  phone: string;

  @Column({ type: 'text', nullable: true })
  email: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // NUMHISTORIA from the legacy OTOLARYN desktop app — only set for
  // patients brought in by the historical data migration.
  @Column({ name: 'legacy_id', type: 'text', nullable: true })
  legacyId: string | null;

  @Column({ name: 'insurance_entity_id', type: 'uuid', nullable: true })
  insuranceEntityId: string | null;

  // FPRIMERACONSULTA from the legacy app — date only, no time component.
  @Column({ name: 'first_consultation_date', type: 'date', nullable: true })
  firstConsultationDate: string | null;

  // "Médico habitual" — no legacy equivalent (pacientes.xls has no doctor
  // column), a forward-looking field editable from the patient's own page.
  @Column({ name: 'assigned_practitioner_id', type: 'uuid', nullable: true })
  assignedPractitionerId: string | null;

  // PROFESION from the legacy app.
  @Column({ type: 'text', nullable: true })
  profession: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
