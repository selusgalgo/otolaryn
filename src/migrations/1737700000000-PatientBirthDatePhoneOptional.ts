import { MigrationInterface, QueryRunner } from 'typeorm';

// Fecha de nacimiento y teléfono dejan de ser obligatorios en la BD: un
// fichero legado real trae muchos pacientes sin uno u otro (en la primera
// importación de prueba, ~1.900 de ~8.100 filas llegaban sin fecha y ~250
// sin teléfono) y la importación debe admitir esos vacíos en vez de omitir
// la fila entera. No se inventa ningún valor: queda NULL.
//
// Solo se relaja la columna. El alta manual de un paciente sigue exigiendo
// ambos datos (CreatePatientDto no cambia): los vacíos solo entran por la
// importación (ImportPatientDto). Ningún índice depende de estas columnas.
export class PatientBirthDatePhoneOptional1737700000000 implements MigrationInterface {
  name = 'PatientBirthDatePhoneOptional1737700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        ALTER COLUMN date_of_birth DROP NOT NULL,
        ALTER COLUMN phone DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No es reversible con seguridad si ya hay filas con NULL — mismo
    // criterio que PatientDocumentIdOptional1734200000000: aquí no se
    // inventa ningún valor de relleno. Un rollback real necesitaría
    // rellenar antes esos NULL con un valor elegido por quien lo haga.
    await queryRunner.query(`
      ALTER TABLE public.patients
        ALTER COLUMN date_of_birth SET NOT NULL,
        ALTER COLUMN phone SET NOT NULL
    `);
  }
}
