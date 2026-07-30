import { MigrationInterface, QueryRunner } from 'typeorm';

// Closes a gap found in review: appointments.patient_id referenced
// patients.id alone, with nothing tying the referenced patient to the same
// tenant as the appointment. Postgres foreign key checks do not respect
// RLS, so that FK alone let an appointment for tenant A point at a
// tenant B patient — confirmed with a live INSERT during review. RLS still
// hides that row from anyone but tenant A, but the cross-tenant link itself
// was never rejected. A composite FK on (patient_id, tenant_id) makes that
// state impossible to create in the first place, not just hard to see.
export class AppointmentsTenantConsistency1732900000000 implements MigrationInterface {
  name = 'AppointmentsTenantConsistency1732900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // patients.id is already a primary key (so already unique on its own);
    // this composite unique constraint is what lets it also serve as the
    // target of a composite foreign key that pins tenant_id too.
    await queryRunner.query(`
      ALTER TABLE public.patients
        ADD CONSTRAINT patients_id_tenant_id_key UNIQUE (id, tenant_id)
    `);

    await queryRunner.query(`
      ALTER TABLE public.appointments
        ADD CONSTRAINT appointments_patient_tenant_fk
        FOREIGN KEY (patient_id, tenant_id)
        REFERENCES public.patients (id, tenant_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.appointments DROP CONSTRAINT appointments_patient_tenant_fk
    `);
    await queryRunner.query(`
      ALTER TABLE public.patients DROP CONSTRAINT patients_id_tenant_id_key
    `);
  }
}
