import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ImportJobType = 'patients' | 'patients-update' | 'clinical-entries';
export type ImportJobStatus = 'running' | 'completed';

// Holds a single bulk import's already-parsed rows plus a cursor, so the
// work can be spread across many short HTTP requests instead of one long
// one — see ImportJobs1735600000000 for why. `rows`/`extra` are typed
// loosely here (the caller knows the real shape — ImportRow[] for
// patients, ClinicalEntryImportRow[] + a doctorMapping for consultas);
// this entity only ever moves them in and out of jsonb, never reads them.
@Entity({ name: 'import_jobs' })
export class ImportJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'text' })
  type: ImportJobType;

  @Column({ type: 'text', default: 'running' })
  status: ImportJobStatus;

  @Column({ type: 'jsonb' })
  rows: unknown[];

  // e.g. { doctorMapping: Record<string,string> } for clinical-entries —
  // null for patients, which needs no extra per-job context.
  @Column({ type: 'jsonb', nullable: true })
  extra: Record<string, unknown> | null;

  @Column({ name: 'total_rows', type: 'int' })
  totalRows: number;

  @Column({ type: 'int', default: 0 })
  cursor: number;

  @Column({ name: 'created_count', type: 'int', default: 0 })
  createdCount: number;

  @Column({ type: 'jsonb', default: [] })
  skipped: { row: number; reason: string }[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
