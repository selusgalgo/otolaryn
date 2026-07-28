import { Pool } from 'pg';
import { ownerPool } from './support/pools';

// This is the test that outlives the rest of the spike: it doesn't know
// the names "patients" or "appointments", it just walks pg_class for the
// public (business) schema and fails if ANY ordinary table there is
// missing RLS or FORCE RLS. Add a table to public without wiring up a
// policy and this fails on the next CI run — no one has to remember to
// update a list here.
describe('RLS: every business table has row security enabled, by introspection', () => {
  let owner: Pool;

  beforeAll(() => {
    owner = ownerPool();
  });

  afterAll(async () => {
    await owner.end();
  });

  // Tables that are infrastructure, not tenant business data, and are
  // exempt by construction (typeorm's own migrations bookkeeping table).
  const EXEMPT_TABLES = new Set(['migrations']);

  it('has at least one business table to check (sanity guard against a vacuously-true test)', async () => {
    const { rows } = await owner.query<{ relname: string }>(`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `);
    const businessTables = rows.filter((r) => !EXEMPT_TABLES.has(r.relname));
    expect(businessTables.length).toBeGreaterThan(0);
  });

  it('every non-exempt table in the public schema has RLS and FORCE RLS enabled', async () => {
    const { rows } = await owner.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `);

    const offenders = rows.filter(
      (r) =>
        !EXEMPT_TABLES.has(r.relname) &&
        (!r.relrowsecurity || !r.relforcerowsecurity),
    );

    expect(offenders).toEqual([]);
  });

  it('every RLS-enabled table has at least one policy defined (catches ENABLE ROW LEVEL SECURITY landing without a matching CREATE POLICY)', async () => {
    const { rows } = await owner.query<{
      relname: string;
      policy_count: string;
    }>(`
      SELECT c.relname, count(p.polname) AS policy_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_policy p ON p.polrelid = c.oid
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
      GROUP BY c.relname
    `);

    const offenders = rows.filter((r) => Number(r.policy_count) === 0);
    expect(offenders).toEqual([]);
  });
});
