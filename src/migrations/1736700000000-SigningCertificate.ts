import { MigrationInterface, QueryRunner } from 'typeorm';

// The digital certificate (.p12) the platform signs documents with, uploaded
// from the superadmin panel (Facturación → Certificado digital) instead of
// being copied to the server by hand. See PdfSignerService.
//
// One row at most (id is always 1). Both columns are AES-256-GCM ciphertext
// (SecretBox): the .p12 is already protected by its own passphrase, and the
// passphrase is encrypted separately, with a key derived from the backend's
// JWT_SECRET — so a database dump alone, or a leaked backup, holds nothing a
// signature can be made with. Rotating JWT_SECRET therefore makes the stored
// certificate unreadable until it is uploaded again (the panel says so).
//
// uploaded_by is the superadmin who installed it, kept as a plain uuid (no
// foreign key): the trail must outlive that user account.
export class SigningCertificate1736700000000 implements MigrationInterface {
  name = 'SigningCertificate1736700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE iam.signing_certificate (
        id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        p12_encrypted bytea NOT NULL,
        passphrase_encrypted bytea NOT NULL,
        uploaded_at timestamptz NOT NULL DEFAULT now(),
        uploaded_by uuid
      )
    `);
    // Explicit grant — production has no ALTER DEFAULT PRIVILEGES rule (see
    // GrantMissingPublicTablePrivileges1735000000000). DELETE too: removing
    // the certificate from the panel deletes the row.
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON iam.signing_certificate TO otolaryn_app`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS iam.signing_certificate`);
  }
}
