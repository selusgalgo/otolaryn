import { Pool } from 'pg';
import { appPool } from './support/pools';

// otolaryn_app is the only role the running process ever authenticates as.
// If it ever gained BYPASSRLS, superuser, or table ownership, every other
// test in this suite would still pass locally while production leaked data
// — so this has to be checked against the actual role attributes, not
// inferred from behaviour.
describe('RLS: runtime role cannot bypass row security', () => {
  let app: Pool;

  beforeAll(() => {
    app = appPool();
  });

  afterAll(async () => {
    await app.end();
  });

  it('otolaryn_app has neither BYPASSRLS nor superuser', async () => {
    const { rows } = await app.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].rolsuper).toBe(false);
    expect(rows[0].rolbypassrls).toBe(false);
  });

  it('otolaryn_app does not own the RLS-protected business tables', async () => {
    const { rows } = await app.query<{ tablename: string; tableowner: string }>(
      `SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('patients', 'appointments')`,
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.tableowner).not.toBe(process.env.DB_APP_USER);
    }
  });

  it('otolaryn_app authenticated as the configured runtime user, not the schema owner', async () => {
    const { rows } = await app.query<{ current_user: string }>(
      `SELECT current_user`,
    );
    expect(rows[0].current_user).toBe(process.env.DB_APP_USER);
    expect(rows[0].current_user).not.toBe(process.env.DB_OWNER_USER);
  });
});
