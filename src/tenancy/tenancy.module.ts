import { Module } from '@nestjs/common';
import { RouteTenantContextInterceptor } from './route-tenant-context.interceptor';
import { TenancyContext } from './tenancy-context';
import { TenantContextInterceptor } from './tenant-context.interceptor';

@Module({
  providers: [
    TenancyContext,
    TenantContextInterceptor,
    RouteTenantContextInterceptor,
  ],
  exports: [
    TenancyContext,
    TenantContextInterceptor,
    RouteTenantContextInterceptor,
  ],
})
export class TenancyModule {}
