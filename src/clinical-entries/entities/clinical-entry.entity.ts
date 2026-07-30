import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Append-only by design: no @DeleteDateColumn, no update path in the
// service/controller. Corrections are new entries, not edits.
@Entity({ name: 'clinical_entries' })
export class ClinicalEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'patient_id' })
  patientId: string;

  @Column({ name: 'author_user_id' })
  authorUserId: string;

  @Column({ name: 'visit_date', type: 'timestamptz' })
  visitDate: Date;

  @Column({ name: 'chief_complaint' })
  chiefComplaint: string;

  @Column({ name: 'examination_findings', type: 'text', nullable: true })
  examinationFindings: string | null;

  @Column({ type: 'text', nullable: true })
  diagnosis: string | null;

  @Column({ type: 'text', nullable: true })
  treatment: string | null;

  @Column({ name: 'follow_up_notes', type: 'text', nullable: true })
  followUpNotes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
