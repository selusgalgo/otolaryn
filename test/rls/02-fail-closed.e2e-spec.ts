import { Pool } from 'pg';
import { appPool, ownerPool } from './support/pools';
import {
  createTestTenants,
  destroyTestTenants,
  TestTenant,
} from './support/fixtures';

// If tenant context is never set — or is set to something that isn't a
// real tenant — RLS must return zero rows, never the unfiltered table.
// This is what actually makes "the interceptor forgot to run" a safe
// failure mode instead of a data leak.
describe('RLS: fails closed, never open', () => {
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

  it('returns zero rows when app.tenant_id was never set on the connection', async () => {
    const client = await app.connect();
    try {
      // Deliberately skip the set_config call the interceptor would run.
      const { rows } = await client.query('SELECT id FROM public.patients');
      expect(rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });

  it('returns zero rows for a tenant_id that matches no real tenant', async () => {
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        '00000000-0000-0000-0000-000000000000',
      ]);
      const { rows } = await client.query('SELECT id FROM public.patients');
      expect(rows).toHaveLength(0);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });

  it('does not leak tenant context across statements once the transaction ends', async () => {
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenantA.id,
      ]);
      const inside = await client.query(
        'SELECT id FROM public.patients WHERE id = $1',
        [tenantA.patientId],
      );
      expect(inside.rows).toHaveLength(1);
      await client.query('COMMIT');

      // Same physical connection, new transaction, no set_config this time.
      const { rows } = await client.query('SELECT id FROM public.patients');
      expect(rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });

  it('the owner/migration role is also refused unfiltered access (FORCE ROW LEVEL SECURITY)', async () => {
    const { rows } = await owner.query('SELECT id FROM public.patients');
    expect(rows).toHaveLength(0);
  });
});
