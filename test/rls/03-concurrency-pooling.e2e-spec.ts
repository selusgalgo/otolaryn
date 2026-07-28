// Forces connection reuse across tenants by capping the pool well below
// the number of concurrent requests, then fires interleaved tenant A /
// tenant B requests at the same time. This is the test that actually
// exercises the SET LOCAL-vs-session-SET decision documented in the spike
// spec: a single-user test would never catch a leak, because it never
// forces the same physical connection to serve two tenants back to back.
process.env.DB_POOL_MAX = '3';

import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestApp } from './support/app';
import { ownerPool } from './support/pools';
import {
  createTestTenants,
  destroyTestTenants,
  TestTenant,
} from './support/fixtures';

interface LoginResponse {
  accessToken: string;
}

describe('RLS: no cross-tenant leakage under concurrent pooled requests', () => {
  let app: INestApplication;
  let owner: Pool;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    owner = ownerPool();
    [tenantA, tenantB] = await createTestTenants(owner);

    app = await createTestApp();
    const server = app.getHttpServer() as Server;

    const loginA = await request(server)
      .post('/auth/login')
      .send({ email: tenantA.userEmail, password: tenantA.userPassword });
    const loginB = await request(server)
      .post('/auth/login')
      .send({ email: tenantB.userEmail, password: tenantB.userPassword });

    tokenA = (loginA.body as LoginResponse).accessToken;
    tokenB = (loginB.body as LoginResponse).accessToken;
    expect(tokenA).toBeDefined();
    expect(tokenB).toBeDefined();
  }, 30000);

  afterAll(async () => {
    await app.close();
    await destroyTestTenants(owner, [tenantA, tenantB]);
    await owner.end();
  });

  it('every interleaved response only ever contains its own tenant patient', async () => {
    const server = app.getHttpServer() as Server;
    const REQUEST_COUNT = 40; // well above DB_POOL_MAX=3, forces reuse

    const requests = Array.from({ length: REQUEST_COUNT }, (_, i) => {
      const useTenantA = i % 2 === 0;
      const token = useTenantA ? tokenA : tokenB;
      const expectedName = useTenantA
        ? tenantA.patientName
        : tenantB.patientName;
      const forbiddenName = useTenantA
        ? tenantB.patientName
        : tenantA.patientName;

      return request(server)
        .get('/patients')
        .set('Authorization', `Bearer ${token}`)
        .then((res) => ({ res, expectedName, forbiddenName }));
    });

    const results = await Promise.all(requests);

    for (const { res, expectedName, forbiddenName } of results) {
      expect(res.status).toBe(200);
      const names = (res.body as Array<{ name: string }>).map((p) => p.name);
      expect(names).toContain(expectedName);
      expect(names).not.toContain(forbiddenName);
    }
  }, 30000);
});
