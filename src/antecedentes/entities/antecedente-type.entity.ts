import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type AntecedenteCategory = 'personal' | 'familiar';

@Entity({ name: 'antecedente_types' })
export class AntecedenteType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  // Which of the two widgets on the patient's ficha this type belongs to
  // (Antecedentes personales / Antecedentes familiares) — see
  // AntecedenteTypeCategory1735200000000.
  @Column({ default: 'personal' })
  category: AntecedenteCategory;

  @Column({ default: true })
  active: boolean;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;
}
