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

interface PatientSeed {
  firstName: string;
  lastName: string;
  documentId: string;
  dateOfBirth: string;
  phone: string;
}

interface TenantSeed {
  name: string;
  users: {
    email: string;
    role: 'admin' | 'profesional' | 'recepcion';
    firstName: string;
    lastName: string;
  }[];
  patients: PatientSeed[];
}

const SUPERADMIN = {
  email: 'superadmin@eiduo.dev',
  firstName: 'Eiduo',
  lastName: 'Superadmin',
};

const TENANTS: TenantSeed[] = [
  {
    name: 'Clinica Aurora',
    users: [
      {
        email: 'admin@aurora.test',
        role: 'admin',
        firstName: 'Laura',
        lastName: 'Gomez',
      },
      {
        email: 'staff@aurora.test',
        role: 'profesional',
        firstName: 'Marcos',
        lastName: 'Ibanez',
      },
      {
        email: 'recepcion@aurora.test',
        role: 'recepcion',
        firstName: 'Nuria',
        lastName: 'Serra',
      },
    ],
    patients: [
      {
        firstName: 'Aurora',
        lastName: 'Patient One',
        documentId: '00000001A',
        dateOfBirth: '1985-03-12',
        phone: '+34600000001',
      },
      {
        firstName: 'Aurora',
        lastName: 'Patient Two',
        documentId: '00000002A',
        dateOfBirth: '1990-07-20',
        phone: '+34600000002',
      },
    ],
  },
  {
    name: 'Clinica Boreal',
    users: [
      {
        email: 'admin@boreal.test',
        role: 'admin',
        firstName: 'Elena',
        lastName: 'Ruiz',
      },
      {
        email: 'staff@boreal.test',
        role: 'profesional',
        firstName: 'Diego',
        lastName: 'Torres',
      },
      {
        email: 'recepcion@boreal.test',
        role: 'recepcion',
        firstName: 'Sara',
        lastName: 'Molina',
      },
    ],
    patients: [
      {
        firstName: 'Boreal',
        lastName: 'Patient One',
        documentId: '00000001B',
        dateOfBirth: '1978-11-05',
        phone: '+34600000003',
      },
      {
        firstName: 'Boreal',
        lastName: 'Patient Two',
        documentId: '00000002B',
        dateOfBirth: '1995-01-30',
        phone: '+34600000004',
      },
    ],
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
          `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            tenantId,
            user.email,
            passwordHash,
            user.role,
            user.firstName,
            user.lastName,
          ],
        );
      }

      const queryRunner = dataSource.createQueryRunner();
      try {
        await queryRunner.connect();
        await queryRunner.startTransaction();
      } catch (err) {
        await queryRunner.release();
        throw err;
      }
      try {
        await queryRunner.query(
          `SELECT set_config('app.tenant_id', $1, true)`,
          [tenantId],
        );
        for (const patient of tenantSeed.patients) {
          await queryRunner.query(
            `INSERT INTO public.patients (tenant_id, first_name, last_name, document_id, date_of_birth, phone)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              tenantId,
              patient.firstName,
              patient.lastName,
              patient.documentId,
              patient.dateOfBirth,
              patient.phone,
            ],
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

    // Not tied to any tenant — tenant_id stays NULL, which is only valid
    // for role 'superadmin' (enforced by users_tenant_superadmin_check).
    await dataSource.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES (NULL, $1, $2, 'superadmin', $3, $4)`,
      [
        SUPERADMIN.email,
        passwordHash,
        SUPERADMIN.firstName,
        SUPERADMIN.lastName,
      ],
    );
    console.log(`Seeded superadmin ${SUPERADMIN.email}`);

    console.log(`Dev login password for all seeded users: ${DEV_PASSWORD}`);
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
