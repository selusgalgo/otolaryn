import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { firstValueFrom, from, Observable } from 'rxjs';
import { DataSource } from 'typeorm';
import { TenancyContext } from './tenancy-context';

interface AuthenticatedRequest {
  user?: { userId: string; tenantId: string; role: string };
}

// Wraps every authenticated request in its own transaction and pins the
// Postgres session variable app.tenant_id for its lifetime via
// `SELECT set_config('app.tenant_id', $1, true)` — the parameterised
// equivalent of `SET LOCAL app.tenant_id = '<uuid>'`. set_config() is a
// normal function call, so it accepts a bind parameter (SET LOCAL's own
// grammar does not), which avoids building SQL by string interpolation.
// `is_local = true` gives the same reset-on-commit/rollback behaviour as
// SET LOCAL, which is what makes this safe to reuse across pooled
// connections (see decision note in the spike spec).
//
// Read-only requests go through this too — there is no fast path that
// skips the transaction, because a fast path is exactly the kind of thing
// a future PR could accidentally extend to a write.
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenancyContext: TenancyContext,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const tenantId = request.user?.tenantId;

    if (!tenantId || !isUUID(tenantId)) {
      throw new ForbiddenException('Missing or invalid tenant context');
    }

    return from(this.runInTenantTransaction(tenantId, next));
  }

  private async runInTenantTransaction(
    tenantId: string,
    next: CallHandler,
  ): Promise<unknown> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenantId,
      ]);

      const result = await this.tenancyContext.run<Promise<unknown>>(
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
}
