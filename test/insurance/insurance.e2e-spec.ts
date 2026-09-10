import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import * as argon2 from 'argon2';
import { createTestApp } from '../rls/support/app';
import { ownerPool } from '../rls/support/pools';
import {
  createTestTenants,
  destroyTestTenants,
  TestTenant,
} from '../rls/support/fixtures';

interface LoginResponse {
  accessToken: string;
}

interface InsuranceEntityResponse {
  id: string;
  name: string;
}

const RECEPCION_PASSWORD = 'InsuranceTest-Recepcion1!';

describe('Insurance entities', () => {
  let app: INestApplication;
  let server: Server;
  let owner: Pool;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let tokenA: string;
  let tokenB: string;
  let tokenRecepcion: string;

  beforeAll(async () => {
    owner = ownerPool();
    [tenantA, tenantB] = await createTestTenants(owner);

    const recepcionHash = await argon2.hash(RECEPCION_PASSWORD, {
      type: argon2.argon2id,
    });
    const recepcionEmail = `insurance-recepcion-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, 'recepcion', 'Test', 'Recepcion')`,
      [tenantA.id, recepcionEmail, recepcionHash],
    );

    app = await createTestApp();
    server = app.getHttpServer() as Server;

    const loginA = await request(server)
      .post('/auth/login')
      .send({ identifier: tenantA.userEmail, password: tenantA.userPassword });
    const loginB = await request(server)
      .post('/auth/login')
      .send({ identifier: tenantB.userEmail, password: tenantB.userPassword });
    const loginRecepcion = await request(server)
      .post('/auth/login')
      .send({ identifier: recepcionEmail, password: RECEPCION_PASSWORD });

    tokenA = (loginA.body as LoginResponse).accessToken;
    tokenB = (loginB.body as LoginResponse).accessToken;
    tokenRecepcion = (loginRecepcion.body as LoginResponse).accessToken;
    expect(tokenA).toBeDefined();
    expect(tokenB).toBeDefined();
    expect(tokenRecepcion).toBeDefined();
  }, 30000);

  afterAll(async () => {
    await app.close();
    await destroyTestTenants(owner, [tenantA, tenantB]);
    await owner.end();
  });

  it('creates, lists and renames an insurance entity', async () => {
    const created = await request(server)
      .post('/insurance-entities')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Sanitas' });
    expect(created.status).toBe(201);
    const id = (created.body as InsuranceEntityResponse).id;

    const list = await request(server)
      .get('/insurance-entities')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(list.status).toBe(200);
    expect(
      (list.body as InsuranceEntityResponse[]).some((e) => e.id === id),
    ).toBe(true);

    const renamed = await request(server)
      .patch(`/insurance-entities/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Sanitas SA' });
    expect(renamed.status).toBe(200);
    expect((renamed.body as InsuranceEntityResponse).name).toBe('Sanitas SA');
  });

  it('rejects a duplicate name (case-insensitive)', async () => {
    await request(server)
      .post('/insurance-entities')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Adeslas' });

    const dup = await request(server)
      .post('/insurance-entities')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'ADESLAS' });
    expect(dup.status).toBe(409);
  });

  it('deletes an unused entity but blocks deleting one already assigned to a patient', async () => {
    const unused = await request(server)
      .post('/insurance-entities')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'DKV' });
    const unusedId = (unused.body as InsuranceEntityResponse).id;

    const del = await request(server)
      .delete(`/insurance-entities/${unusedId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(204);

    const inUse = await request(server)
      .post('/insurance-entities')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Mapfre' });
    const inUseId = (inUse.body as InsuranceEntityResponse).id;

    await request(server)
      .patch(`/patients/${tenantA.patientId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ insuranceEntityId: inUseId });

    const blocked = await request(server)
      .delete(`/insurance-entities/${inUseId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(blocked.status).toBe(409);
  });

  it("does not see another tenant's insurance entities", async () => {
    const created = await request(server)
      .post('/insurance-entities')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Solo Tenant A' });
    const id = (created.body as InsuranceEntityResponse).id;

    const listB = await request(server)
      .get('/insurance-entities')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(
      (listB.body as InsuranceEntityResponse[]).some((e) => e.id === id),
    ).toBe(false);
  });

  it('lets recepcion read but not write the catalog', async () => {
    const read = await request(server)
      .get('/insurance-entities')
      .set('Authorization', `Bearer ${tokenRecepcion}`);
    expect(read.status).toBe(200);

    const write = await request(server)
      .post('/insurance-entities')
      .set('Authorization', `Bearer ${tokenRecepcion}`)
      .send({ name: 'Should not be allowed' });
    expect(write.status).toBe(403);
  });
});
