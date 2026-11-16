import { Column, Entity, PrimaryColumn } from 'typeorm';

// The certificate the platform signs documents with, as uploaded from the
// superadmin panel — see SigningCertificate1736700000000. A single row (id is
// always 1). Both byte columns are SecretBox ciphertext, never plaintext.
@Entity({ schema: 'iam', name: 'signing_certificate' })
export class SigningCertificate {
  @PrimaryColumn({ type: 'smallint' })
  id: number;

  @Column({ name: 'p12_encrypted', type: 'bytea' })
  p12Encrypted: Buffer;

  @Column({ name: 'passphrase_encrypted', type: 'bytea' })
  passphraseEncrypted: Buffer;

  @Column({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt: Date;

  // The superadmin who installed it; no foreign key on purpose.
  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true })
  uploadedBy: string | null;
}
