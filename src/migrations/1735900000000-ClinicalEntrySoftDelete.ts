import { MigrationInterface, QueryRunner } from 'typeorm';

// Lets an admin remove a clinical entry created by mistake (wrong patient,
// test data, a duplicate from an import) without a hard DELETE — the app
// was append-only by design (ClinicalEntriesController's own comment:
// "a correction is a new entry, not an edit to history"), and that
// invariant stays true for everyone except admin, who now gets an
// explicit, narrow override. Soft delete, same pattern as
// Patient.deletedAt: the row survives (so a PDF or an old reference to it
// never 500s), TypeORM's query builder just stops returning it once this
// is set.
export class ClinicalEntrySoftDelete1735900000000 implements MigrationInterface {
  name = 'ClinicalEntrySoftDelete1735900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.clinical_entries
        ADD COLUMN deleted_at timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.clinical_entries DROP COLUMN deleted_at
    `);
  }
}
