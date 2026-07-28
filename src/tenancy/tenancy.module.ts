import { Module } from '@nestjs/common';
import { TenancyContext } from './tenancy-context';
import { TenantContextInterceptor } from './tenant-context.interceptor';

@Module({
  providers: [TenancyContext, TenantContextInterceptor],
  exports: [TenancyContext, TenantContextInterceptor],
})
export class TenancyModule {}
