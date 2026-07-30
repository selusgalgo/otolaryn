import * as argon2 from 'argon2';
import { Pool } from 'pg';

export interface TestTenant {
  id: string;
  name: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientName: string;
  userEmail: string;
  userPassword: string;
}

const TEST_PASSWORD = 'RlsTest-Passw0rd!';

// Creates two throwaway tenants with clearly-prefixed, unique names so
// assertions can check "zero rows from the other tenant" rather than just
// "some rows look right". Patients are inserted through the same
// set_config()-in-a-transaction path the real interceptor uses, because
// otolaryn_owner is itself subject to FORCE ROW LEVEL SECURITY.
export async function createTestTenants(
  pool: Pool,
): Promise<[TestTenant, TestTenant]> {
  const passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
  });
  const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const tenants: TestTenant[] = [];
  for (const label of ['RLS-Test-Alpha', 'RLS-Test-Beta']) {
    const tenantName = `${label}-${runId}`;
    const {
      rows: [{ id: tenantId }],
    } = await pool.query<{ id: string }>(
      `INSERT INTO iam.tenants (name) VALUES ($1) RETURNING id`,
      [tenantName],
    );

    const email = `${label.toLowerCase()}-${runId}@rls-test.local`;
    await pool.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
      [tenantId, email, passwordHash],
    );

    const patientFirstName = label;
    const patientLastName = `Patient ${runId}`;
    const patientName = `${patientFirstName} ${patientLastName}`;
    const client = await pool.connect();
    let patientId: string;
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenantId,
      ]);
      const {
        rows: [{ id }],
      } = await client.query<{ id: string }>(
        `INSERT INTO public.patients (tenant_id, first_name, last_name, document_id, date_of_birth, phone)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          tenantId,
          patientFirstName,
          patientLastName,
          `DOC-${runId}-${label}`,
          '1990-01-01',
          '+34600000000',
        ],
      );
      patientId = id;
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    tenants.push({
      id: tenantId,
      name: tenantName,
      patientId,
      patientFirstName,
      patientLastName,
      patientName,
      userEmail: email,
      userPassword: TEST_PASSWORD,
    });
  }

  return tenants as [TestTenant, TestTenant];
}

export async function destroyTestTenants(
  pool: Pool,
  tenants: TestTenant[],
): Promise<void> {
  for (const tenant of tenants) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenant.id,
      ]);
      await client.query(
        `DELETE FROM public.appointments WHERE tenant_id = $1`,
        [tenant.id],
      );
      await client.query(`DELETE FROM public.patients WHERE tenant_id = $1`, [
        tenant.id,
      ]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  const ids = tenants.map((t) => t.id);
  await pool.query(`DELETE FROM iam.users WHERE tenant_id = ANY($1::uuid[])`, [
    ids,
  ]);
  await pool.query(`DELETE FROM iam.tenants WHERE id = ANY($1::uuid[])`, [ids]);
}
