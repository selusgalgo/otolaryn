import { MigrationInterface, QueryRunner } from 'typeorm';

// Metadatos de los archivos adjuntos (PDF e imágenes) de una consulta. El
// archivo en sí vive en una carpeta del servidor (ver AttachmentStorage);
// `storage_key` es su ruta relativa a esa carpeta. Mismo aislamiento por clínica
// que clinical_entries (RLS forzada). Al borrarse una consulta de verdad (solo
// pasa con los borradores) sus filas se van en cascada; los archivos los borra
// el código que borra la consulta. Las consultas firmadas solo se borran de forma
// lógica, así que conservan sus adjuntos.
export class ClinicalEntryAttachments1736400000000 implements MigrationInterface {
  name = 'ClinicalEntryAttachments1736400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.clinical_entry_attachments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES iam.tenants(id) ON DELETE CASCADE,
        clinical_entry_id uuid NOT NULL
          REFERENCES public.clinical_entries(id) ON DELETE CASCADE,
        uploaded_by_user_id uuid NOT NULL REFERENCES iam.users(id),
        original_name text NOT NULL,
        mime_type text NOT NULL,
        size_bytes integer NOT NULL CHECK (size_bytes > 0),
        storage_key text NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX clinical_entry_attachments_entry_idx
        ON public.clinical_entry_attachments (clinical_entry_id)
    `);
    await queryRunner.query(
      `ALTER TABLE public.clinical_entry_attachments ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE public.clinical_entry_attachments FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(`
      CREATE POLICY tenant_isolation ON public.clinical_entry_attachments
        USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    `);
    await queryRunner.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE
        ON public.clinical_entry_attachments TO otolaryn_app
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS public.clinical_entry_attachments`,
    );
  }
}
