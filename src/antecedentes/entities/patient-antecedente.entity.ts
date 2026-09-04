import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// The row's mere existence means "marcado" — see antecedente_types.entity
// and arquitectura_otolaryn_saas.md section 11. `detalle` preserves a
// legacy nuance like TABACO = "4-5" (cigarettes/day) that doesn't fit a
// plain boolean.
@Entity({ name: 'patient_antecedentes' })
export class PatientAntecedente {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'patient_id' })
  patientId: string;

  @Column({ name: 'antecedente_type_id' })
  antecedenteTypeId: string;

  @Column({ type: 'text', nullable: true })
  detalle: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
