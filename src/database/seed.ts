import 'dotenv/config';
import * as argon2 from 'argon2';
import migrationDataSource from './data-source';

// Seeds two clearly-distinguishable fake tenants so tests can assert "zero
// cross-tenant rows", not just "some correct rows". Connects as the schema
// owner and, for the RLS-protected tables, goes through the exact same
// set_config()-in-a-transaction dance as TenantContextInterceptor — even
// the owner needs it, because patients/appointments use
// FORCE ROW LEVEL SECURITY.

const DEV_PASSWORD = 'Passw0rd!';

interface TenantSeed {
  name: string;
  users: { email: string; role: 'admin' | 'staff' }[];
  patients: string[];
}

const TENANTS: TenantSeed[] = [
  {
    name: 'Clinica Aurora',
    users: [
      { email: 'admin@aurora.test', role: 'admin' },
      { email: 'staff@aurora.test', role: 'staff' },
    ],
    patients: ['Aurora Patient One', 'Aurora Patient Two'],
  },
  {
    name: 'Clinica Boreal',
    users: [
      { email: 'admin@boreal.test', role: 'admin' },
      { email: 'staff@boreal.test', role: 'staff' },
    ],
    patients: ['Boreal Patient One', 'Boreal Patient Two'],
  },
];

async function seed() {
  const dataSource = await migrationDataSource.initialize();
  const passwordHash = await argon2.hash(DEV_PASSWORD, {
    type: argon2.argon2id,
  });

  try {
    for (const tenantSeed of TENANTS) {
      const [{ id: tenantId }] = await dataSource.query<{ id: string }[]>(
        `INSERT INTO iam.tenants (name) VALUES ($1) RETURNING id`,
        [tenantSeed.name],
      );

      for (const user of tenantSeed.users) {
        await dataSource.query(
          `INSERT INTO iam.users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
          [tenantId, user.email, passwordHash, user.role],
        );
      }

      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        await queryRunner.query(
          `SELECT set_config('app.tenant_id', $1, true)`,
          [tenantId],
        );
        for (const patientName of tenantSeed.patients) {
          await queryRunner.query(
            `INSERT INTO public.patients (tenant_id, name) VALUES ($1, $2)`,
            [tenantId, patientName],
          );
        }
        await queryRunner.commitTransaction();
      } catch (err) {
        await queryRunner.rollbackTransaction();
        throw err;
      } finally {
        await queryRunner.release();
      }

      console.log(`Seeded tenant "${tenantSeed.name}" (${tenantId})`);
    }

    console.log(`Dev login password for all seeded users: ${DEV_PASSWORD}`);
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
