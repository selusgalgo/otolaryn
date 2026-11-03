import { MigrationInterface, QueryRunner } from 'typeorm';

// Tratamiento con el que se muestra a un médico ("Dr." o "Dra."). Hasta
// ahora la ficha del paciente anteponía "Dr." a todos, también a las
// doctoras. Solo se usa para quien ejerce como médico (role 'profesional', o
// admin con staff_function 'profesional'), pero la columna no está acotada
// por rol a nivel de BD, igual que agenda_access. Default 'Dr.' para que todo
// el personal existente se vea exactamente como hasta ahora hasta que un admin
// elija 'Dra.' para quien corresponda.
export class UserHonorific1736200000000 implements MigrationInterface {
  name = 'UserHonorific1736200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.users
        ADD COLUMN honorific text NOT NULL DEFAULT 'Dr.',
        ADD CONSTRAINT users_honorific_check CHECK (honorific IN ('Dr.', 'Dra.'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE iam.users
        DROP CONSTRAINT users_honorific_check,
        DROP COLUMN honorific
    `);
  }
}
