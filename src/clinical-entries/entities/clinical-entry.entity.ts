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

  // A patient's insurer can change between visits — this is the entry's
  // own ENTIDAD from the legacy consultas.xls, independent of whichever
  // insurer is currently set on the patient record.
  @Column({ name: 'insurance_entity_id', type: 'uuid', nullable: true })
  insuranceEntityId: string | null;

  // 1-based row index within consultas.xls for entries created by the
  // historical data migration — not NUMHISTORIA (see migration comment).
  // null for entries created normally through the app.
  @Column({ name: 'legacy_id', type: 'text', nullable: true })
  legacyId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
