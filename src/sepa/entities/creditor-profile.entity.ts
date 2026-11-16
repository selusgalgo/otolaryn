import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// The single creditor row (id is always 1) — whoever collects Mederi's
// fees. Printed as "Acreedor" on every SEPA mandate; see SepaMandates1736500000000.
@Entity({ schema: 'iam', name: 'creditor_profile' })
export class CreditorProfile {
  @PrimaryColumn({ type: 'smallint' })
  id: number;

  // Natural person or company name, as registered with the tax agency.
  @Column()
  name: string;

  @Column({ name: 'tax_id' })
  taxId: string;

  @Column()
  address: string;

  @Column({ name: 'postal_code' })
  postalCode: string;

  @Column()
  city: string;

  @Column()
  province: string;

  @Column()
  country: string;

  @Column()
  email: string;

  @Column()
  phone: string;

  @Column({ type: 'text', nullable: true })
  website: string | null;

  // Identificador de acreedor SEPA (ES00ZZZ…), assigned via the bank —
  // not the same thing as taxId, though it embeds it.
  @Column({ name: 'sepa_creditor_id' })
  sepaCreditorId: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
