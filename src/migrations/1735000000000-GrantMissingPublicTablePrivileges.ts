import { MigrationInterface, QueryRunner } from 'typeorm';

// Every public-schema table's own migration (InitSchema's patients/
// appointments, ClinicalEntries, InsuranceEntities, PatientAntecedentes,
// PatientNumberCounters) skipped an explicit GRANT to otolaryn_app —
// harmless in local dev, which has an `ALTER DEFAULT PRIVILEGES ... GRANT
// ... TO otolaryn_app` rule set up once outside of any migration, so every
// new public table gets otolaryn_app access automatically. Production has
// no such rule: whatever broad grant made patients/appointments work there
// only ever covered the tables that existed at the time, silently leaving
// every public table added since (insurance_entities, antecedente_types,
// patient_antecedentes, patient_number_counters) with zero privileges for
// otolaryn_app — the exact "permission denied for table
// patient_number_counters" that broke creating a patient in production.
// Regranting an already-granted privilege is a no-op, so this is safe to
// run again anywhere, including local.
export class GrantMissingPublicTablePrivileges1735000000000 implements MigrationInterface {
  name = 'GrantMissingPublicTablePrivileges1735000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON
        public.patients,
        public.appointments,
        public.clinical_entries,
        public.insurance_entities,
        public.antecedente_types,
        public.patient_antecedentes,
        public.patient_number_counters
      TO otolaryn_app
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      REVOKE SELECT, INSERT, UPDATE, DELETE ON
        public.patients,
        public.appointments,
        public.clinical_entries,
        public.insurance_entities,
        public.antecedente_types,
        public.patient_antecedentes,
        public.patient_number_counters
      FROM otolaryn_app
    `);
  }
}
