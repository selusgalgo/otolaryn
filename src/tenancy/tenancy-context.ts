import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { EntityManager, QueryRunner } from 'typeorm';

interface TenantStore {
  queryRunner: QueryRunner;
  tenantId: string;
}

// Every repository call made during a tenant-scoped request must go through
// the single QueryRunner opened by TenantContextInterceptor — that's the
// connection carrying the `SET LOCAL app.tenant_id` for this transaction.
// Pulling a repository from the default pool instead would silently escape
// RLS enforcement, so services fetch their EntityManager from here rather
// than via @InjectRepository.
@Injectable()
export class TenancyContext {
  private readonly als = new AsyncLocalStorage<TenantStore>();

  run<T>(store: TenantStore, fn: () => T): T {
    return this.als.run(store, fn);
  }

  get manager(): EntityManager {
    const store = this.als.getStore();
    if (!store) {
      throw new Error(
        'TenancyContext accessed outside of a tenant-scoped request',
      );
    }
    return store.queryRunner.manager;
  }

  get tenantId(): string {
    const store = this.als.getStore();
    if (!store) {
      throw new Error(
        'TenancyContext accessed outside of a tenant-scoped request',
      );
    }
    return store.tenantId;
  }
}
