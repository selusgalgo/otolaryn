import { MigrationInterface, QueryRunner } from 'typeorm';

export class PatientSecondPhone1734400000000 implements MigrationInterface {
  name = 'PatientSecondPhone1734400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        ADD COLUMN phone2 text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.patients
        DROP COLUMN phone2
    `);
  }
}
