import { Pool } from 'pg';
import { appPool, ownerPool } from './support/pools';
import {
  createTestTenants,
  destroyTestTenants,
  TestTenant,
} from './support/fixtures';

// With tenant A's context set, no query against an RLS-protected table may
// return a row belonging to tenant B — for every such table, not just the
// one the test author happened to think of.
describe('RLS: basic isolation', () => {
  let owner: Pool;
  let app: Pool;
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  beforeAll(async () => {
    owner = ownerPool();
    app = appPool();
    [tenantA, tenantB] = await createTestTenants(owner);
  });

  afterAll(async () => {
    await destroyTestTenants(owner, [tenantA, tenantB]);
    await owner.end();
    await app.end();
  });

  async function withTenant<T>(
    tenantId: string,
    fn: (client: import('pg').PoolClient) => Promise<T>,
  ) {
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenantId,
      ]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  interface PatientRow {
    id: string;
    tenant_id: string;
    name: string;
  }

  it('never returns tenant B patients while scoped to tenant A', async () => {
    const { rows } = await withTenant(tenantA.id, (client) =>
      client.query<PatientRow>(
        'SELECT id, tenant_id, name FROM public.patients',
      ),
    );

    expect(rows.some((r) => r.id === tenantA.patientId)).toBe(true);
    expect(rows.some((r) => r.id === tenantB.patientId)).toBe(false);
    expect(rows.every((r) => r.tenant_id === tenantA.id)).toBe(true);
  });

  it('never returns tenant A patients while scoped to tenant B', async () => {
    const { rows } = await withTenant(tenantB.id, (client) =>
      client.query<PatientRow>(
        'SELECT id, tenant_id, name FROM public.patients',
      ),
    );

    expect(rows.some((r) => r.id === tenantB.patientId)).toBe(true);
    expect(rows.some((r) => r.id === tenantA.patientId)).toBe(false);
    expect(rows.every((r) => r.tenant_id === tenantB.id)).toBe(true);
  });

  it('blocks a direct row lookup by id across tenants', async () => {
    const { rows } = await withTenant(tenantA.id, (client) =>
      client.query('SELECT id FROM public.patients WHERE id = $1', [
        tenantB.patientId,
      ]),
    );

    expect(rows).toHaveLength(0);
  });

  it('blocks an INSERT that claims a tenant_id other than the active one', async () => {
    await expect(
      withTenant(tenantA.id, (client) =>
        client.query(
          'INSERT INTO public.patients (tenant_id, name) VALUES ($1, $2)',
          [tenantB.id, 'cross-tenant write attempt'],
        ),
      ),
    ).rejects.toThrow();
  });

  // Regression test: an appointment's own tenant_id used to be the only
  // thing checked. Postgres foreign keys don't respect RLS, so nothing
  // stopped patient_id from pointing at a different tenant's patient —
  // confirmed with a live INSERT during review, fixed with a composite FK
  // on (patient_id, tenant_id).
  it('blocks an appointment whose patient_id belongs to a different tenant, even with a matching tenant_id', async () => {
    await expect(
      withTenant(tenantA.id, (client) =>
        client.query(
          'INSERT INTO public.appointments (tenant_id, patient_id, scheduled_at) VALUES ($1, $2, now())',
          [tenantA.id, tenantB.patientId],
        ),
      ),
    ).rejects.toThrow();
  });
});
