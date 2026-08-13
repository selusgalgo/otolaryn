import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type UserRole = 'superadmin' | 'admin' | 'profesional' | 'recepcion';

// Deliberately NOT row-level-secured: login must look up a user by email
// before any tenant context exists, so this table can't depend on
// app.tenant_id being set. Isolation for this table is enforced the
// ordinary way (tenant_id is only ever read off the row found by email,
// never trusted from client input).
@Entity({ schema: 'iam', name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Null only for 'superadmin' — every other role belongs to exactly one
  // tenant. Enforced at the DB level by users_tenant_superadmin_check, not
  // just here.
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column()
  email: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ default: 'profesional' })
  role: UserRole;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
