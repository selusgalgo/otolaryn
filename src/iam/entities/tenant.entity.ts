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

  // Schedule lives in ClinicHour (iam.clinic_hours), one row per open time
  // slot — see that entity.

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
