import { MigrationInterface, QueryRunner } from 'typeorm';

// SEPA direct-debit mandates the superadmin generates for each clinic's
// owner (Panel Eiduo → clínica → Domiciliación SEPA). Two tables, both in
// iam next to tenants and, like tenants, outside RLS — only the
// superadmin-only SepaController ever reads or writes them:
//
// - creditor_profile: who collects the fees (printed as "Acreedor" on every
//   mandate). A single row, enforced by the id = 1 check, seeded EMPTY and
//   filled in from the panel.
// - sepa_mandates: one per clinic (debtor data, account, plan and fee).
//   reference is fixed at creation (MED-0001-2026) from its own sequence —
//   a mandate's reference must never change once the client has signed it.
export class SepaMandates1736500000000 implements MigrationInterface {
  name = 'SepaMandates1736500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE iam.creditor_profile (
        id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        name text NOT NULL,
        tax_id text NOT NULL,
        address text NOT NULL,
        postal_code text NOT NULL,
        city text NOT NULL,
        province text NOT NULL,
        country text NOT NULL DEFAULT 'España',
        email text NOT NULL,
        phone text NOT NULL,
        website text,
        sepa_creditor_id text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    // The row exists but is EMPTY on purpose: this repository is public and the
    // creditor is a real person, so their details are entered from the panel
    // (Facturación → Acreedor SEPA) — or set once in the database by whoever
    // deploys — never committed. Until they are filled in, no mandate can be
    // issued (SepaService refuses).
    await queryRunner.query(`
      INSERT INTO iam.creditor_profile
        (id, name, tax_id, address, postal_code, city, province, country,
         email, phone, website, sepa_creditor_id)
      VALUES (1, '', '', '', '', '', '', 'España', '', '', NULL, '')
    `);

    await queryRunner.query(
      `CREATE SEQUENCE iam.sepa_mandate_number_seq START 1`,
    );
    await queryRunner.query(`
      CREATE TABLE iam.sepa_mandates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL UNIQUE REFERENCES iam.tenants(id) ON DELETE CASCADE,
        number integer NOT NULL UNIQUE,
        reference text NOT NULL UNIQUE,
        holder_name text NOT NULL,
        holder_tax_id text NOT NULL,
        clinic_name text NOT NULL,
        signer_name text NOT NULL,
        signer_position text,
        address text NOT NULL,
        postal_code text NOT NULL,
        city text NOT NULL,
        province text NOT NULL,
        country text NOT NULL DEFAULT 'España',
        email text NOT NULL,
        phone text,
        iban text,
        bic text,
        plan_name text NOT NULL,
        monthly_base numeric(10, 2) NOT NULL CHECK (monthly_base > 0),
        vat_percent numeric(5, 2) NOT NULL DEFAULT 21,
        irpf_percent numeric(5, 2) NOT NULL DEFAULT 15,
        first_charge_date date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Explicit grants — production has no ALTER DEFAULT PRIVILEGES rule (see
    // GrantMissingPublicTablePrivileges1735000000000). No DELETE on either:
    // nothing in the app removes a creditor profile or a mandate.
    await queryRunner.query(
      `GRANT SELECT, UPDATE ON iam.creditor_profile TO otolaryn_app`,
    );
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE ON iam.sepa_mandates TO otolaryn_app`,
    );
    await queryRunner.query(
      `GRANT USAGE ON SEQUENCE iam.sepa_mandate_number_seq TO otolaryn_app`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS iam.sepa_mandates`);
    await queryRunner.query(
      `DROP SEQUENCE IF EXISTS iam.sepa_mandate_number_seq`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS iam.creditor_profile`);
  }
}
