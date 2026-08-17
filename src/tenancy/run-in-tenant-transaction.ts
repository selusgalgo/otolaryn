import { CallHandler } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { DataSource } from 'typeorm';
import { TenancyContext } from './tenancy-context';

// Shared by TenantContextInterceptor (tenant comes from the caller's own
// JWT) and RouteTenantContextInterceptor (tenant comes from a :id route
// param instead, for superadmin's cross-tenant routes) — the transaction/
// set_config/rollback mechanics are identical, only *where the tenantId
// comes from* differs, and that trust distinction lives in the two
// interceptors, not here.
export async function runInTenantTransaction(
  dataSource: DataSource,
  tenancyContext: TenancyContext,
  tenantId: string,
  next: CallHandler,
): Promise<unknown> {
  const queryRunner = dataSource.createQueryRunner();
  try {
    await queryRunner.connect();
    await queryRunner.startTransaction();
  } catch (err) {
    // Transaction never started, so there's nothing to roll back — but
    // the connection was checked out of the pool and must still go back.
    await queryRunner.release();
    throw err;
  }

  try {
    await queryRunner.query(`SELECT set_config('app.tenant_id', $1, true)`, [
      tenantId,
    ]);

    const result = await tenancyContext.run<Promise<unknown>>(
      { queryRunner, tenantId },
      () => firstValueFrom(next.handle()),
    );

    await queryRunner.commitTransaction();
    return result;
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
}
