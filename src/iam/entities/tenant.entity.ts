import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ schema: 'iam', name: 'tenants' })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  // Weekly recurring schedule, whole-clinic (not per practitioner), whole
  // days only (no open/close times yet). Index 0=Monday..6=Sunday.
  @Column({ name: 'open_days', type: 'boolean', array: true })
  openDays: boolean[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
