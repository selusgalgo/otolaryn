import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type UserRole = 'admin' | 'staff';

// Deliberately NOT row-level-secured: login must look up a user by email
// before any tenant context exists, so this table can't depend on
// app.tenant_id being set. Isolation for this table is enforced the
// ordinary way (tenant_id is only ever read off the row found by email,
// never trusted from client input).
@Entity({ schema: 'iam', name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ default: 'staff' })
  role: UserRole;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
