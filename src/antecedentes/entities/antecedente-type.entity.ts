import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'antecedente_types' })
export class AntecedenteType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column({ default: true })
  active: boolean;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;
}
