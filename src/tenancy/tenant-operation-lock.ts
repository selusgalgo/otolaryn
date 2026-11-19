import { DataSource, QueryRunner } from 'typeorm';

const LOCK_SQL =
  "SELECT pg_advisory_lock_shared(hashtextextended('mederi-tenant-operation:' || $1::text, 0))";
const UNLOCK_SQL =
  "SELECT pg_advisory_unlock_shared(hashtextextended('mederi-tenant-operation:' || $1::text, 0))";
const TRANSACTION_LOCK_SQL =
  "SELECT pg_advisory_xact_lock_shared(hashtextextended('mederi-tenant-operation:' || $1::text, 0))";

export async function acquireTenantSharedLock(
  runner: QueryRunner,
  tenantId: string,
): Promise<void> {
  await runner.query(LOCK_SQL, [tenantId]);
}

export async function acquireTenantSharedTransactionLock(
  runner: QueryRunner,
  tenantId: string,
): Promise<void> {
  await runner.query(TRANSACTION_LOCK_SQL, [tenantId]);
}

export async function releaseTenantSharedLock(
  runner: QueryRunner,
  tenantId: string,
): Promise<void> {
  await runner.query(UNLOCK_SQL, [tenantId]);
}

export async function withTenantSharedLock<T>(
  dataSource: DataSource,
  tenantId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const runner = dataSource.createQueryRunner();
  let locked = false;
  try {
    await runner.connect();
    await acquireTenantSharedLock(runner, tenantId);
    locked = true;
    return await operation();
  } finally {
    if (locked)
      await releaseTenantSharedLock(runner, tenantId).catch(() => undefined);
    await runner.release().catch(() => undefined);
  }
}

export async function withTenantExclusiveLock<T>(
  dataSource: DataSource,
  tenantId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const runner = dataSource.createQueryRunner();
  let locked = false;
  try {
    await runner.connect();
    await runner.query(
      "SELECT pg_advisory_lock(hashtextextended('mederi-tenant-operation:' || $1::text, 0))",
      [tenantId],
    );
    locked = true;
    return await operation();
  } finally {
    if (locked) {
      await runner
        .query(
          "SELECT pg_advisory_unlock(hashtextextended('mederi-tenant-operation:' || $1::text, 0))",
          [tenantId],
        )
        .catch(() => undefined);
    }
    await runner.release().catch(() => undefined);
  }
}
