import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { from, Observable } from 'rxjs';
import { DataSource } from 'typeorm';
import { runInTenantTransaction } from './run-in-tenant-transaction';
import { TenancyContext } from './tenancy-context';

interface RouteRequest {
  params: Record<string, string>;
}

// Same RLS-transaction mechanics as TenantContextInterceptor, but the
// tenantId comes from the :id route param instead of the caller's own JWT
// — for superadmin routes that browse a clinic chosen at the URL, not the
// caller's own (superadmin has none). Only ever apply this behind a
// controller/route already guarded to @Roles('superadmin') — this
// interceptor itself does no role check, it just trusts whatever tenant id
// is in the URL.
@Injectable()
export class RouteTenantContextInterceptor implements NestInterceptor {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenancyContext: TenancyContext,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RouteRequest>();
    const tenantId = request.params.id;

    if (!tenantId || !isUUID(tenantId)) {
      throw new ForbiddenException('Missing or invalid tenant context');
    }

    return from(
      runInTenantTransaction(
        this.dataSource,
        this.tenancyContext,
        tenantId,
        next,
      ),
    );
  }
}
