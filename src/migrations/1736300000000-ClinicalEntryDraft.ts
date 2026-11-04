import { MigrationInterface, QueryRunner } from 'typeorm';

// Borradores de consulta guardados en el servidor, visibles en la ficha del
// paciente con la etiqueta "Borrador" para que el médico pueda proseguir desde
// cualquier ordenador. `status` vale 'firmada' por defecto, así que todas las
// consultas existentes (y las que sigan creándose sin pasar por un borrador)
// quedan exactamente como estaban. `draft_updated_at` solo existe mientras es
// borrador: de ahí sale la caducidad a los 10 días (borrado automático) y el
// CHECK lo mantiene coherente con el estado.
export class ClinicalEntryDraft1736300000000 implements MigrationInterface {
  name = 'ClinicalEntryDraft1736300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.clinical_entries
        ADD COLUMN status text NOT NULL DEFAULT 'firmada',
        ADD COLUMN draft_updated_at timestamptz,
        ADD CONSTRAINT clinical_entries_status_check
          CHECK (status IN ('borrador', 'firmada')),
        ADD CONSTRAINT clinical_entries_draft_updated_check
          CHECK ((status = 'borrador') = (draft_updated_at IS NOT NULL))
    `);
    await queryRunner.query(`
      CREATE INDEX clinical_entries_drafts_idx
        ON public.clinical_entries (tenant_id, author_user_id, draft_updated_at)
        WHERE status = 'borrador'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS public.clinical_entries_drafts_idx`,
    );
    // Los borradores no son historia clínica: al revertir se descartan en vez
    // de convertirse en consultas firmadas a medio escribir.
    await queryRunner.query(
      `DELETE FROM public.clinical_entries WHERE status = 'borrador'`,
    );
    await queryRunner.query(`
      ALTER TABLE public.clinical_entries
        DROP CONSTRAINT clinical_entries_draft_updated_check,
        DROP CONSTRAINT clinical_entries_status_check,
        DROP COLUMN draft_updated_at,
        DROP COLUMN status
    `);
  }
}
