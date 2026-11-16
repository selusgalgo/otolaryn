import { MigrationInterface, QueryRunner } from 'typeorm';

// Lets the clinic owner fill in their own debtor data and sign the SEPA
// mandate through a one-off link (see SepaPublicController), instead of the
// superadmin typing everything and chasing a signed PDF by email.
//
// - The debtor columns become nullable: the superadmin now creates the
//   mandate with just the commercial terms (plan, fee, first charge) and the
//   client completes the rest. Completeness is enforced when the client saves
//   (SepaDebtorDto), not by the schema.
// - status: pendiente → firmada | cancelada. A signed mandate is immutable;
//   cancelling it is the only way out. Cancelling keeps the signed document
//   and its evidence (SEPA retention); editing a cancelled order reopens it
//   as pendiente and drops that old signature.
// - token_hash: SHA-256 of the signing link's token — never the token
//   itself, so a database leak doesn't hand out working links. One active
//   link per mandate (issuing a new one replaces it).
// - issued_pdf: the exact bytes the client was shown (and, for the certificate
//   route, downloaded and signed). Kept so a signed upload can be checked
//   against it and so the evidence can cite its hash.
// - signed_pdf + signature_*: the signed document and the proof SEPA expects
//   the creditor to keep — for the life of the mandate and 14 months after
//   its last debit. bytea (not files on disk) so it travels with every
//   database dump; a few hundred KB per mandate.
export class SepaSigning1736600000000 implements MigrationInterface {
  name = 'SepaSigning1736600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.sepa_mandates
        ALTER COLUMN holder_name DROP NOT NULL,
        ALTER COLUMN holder_tax_id DROP NOT NULL,
        ALTER COLUMN signer_name DROP NOT NULL,
        ALTER COLUMN address DROP NOT NULL,
        ALTER COLUMN postal_code DROP NOT NULL,
        ALTER COLUMN city DROP NOT NULL,
        ALTER COLUMN province DROP NOT NULL,
        ALTER COLUMN country DROP NOT NULL,
        ALTER COLUMN email DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE iam.sepa_mandates
        ADD COLUMN status text NOT NULL DEFAULT 'pendiente'
          CHECK (status IN ('pendiente', 'firmada', 'cancelada')),
        ADD COLUMN token_hash text UNIQUE,
        ADD COLUMN token_expires_at timestamptz,
        ADD COLUMN issued_pdf bytea,
        ADD COLUMN issued_at timestamptz,
        ADD COLUMN signed_pdf bytea,
        ADD COLUMN signed_at timestamptz,
        ADD COLUMN signature_method text
          CHECK (signature_method IN ('web', 'certificate')),
        ADD COLUMN signature_evidence jsonb,
        ADD COLUMN cancelled_at timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rows saved without debtor data can't go back to NOT NULL; they would
    // have to be completed or removed first, so this is deliberately not
    // restoring those constraints.
    await queryRunner.query(`
      ALTER TABLE iam.sepa_mandates
        DROP COLUMN status,
        DROP COLUMN token_hash,
        DROP COLUMN token_expires_at,
        DROP COLUMN issued_pdf,
        DROP COLUMN issued_at,
        DROP COLUMN signed_pdf,
        DROP COLUMN signed_at,
        DROP COLUMN signature_method,
        DROP COLUMN signature_evidence,
        DROP COLUMN cancelled_at
    `);
  }
}
