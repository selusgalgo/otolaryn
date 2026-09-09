import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
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

interface PatientResponse {
  id: string;
  firstName: string;
}

interface PaginatedPatients {
  data: PatientResponse[];
  total: number;
}

interface BulkDeleteResult {
  deleted: number;
  skipped: { id: string; reason: string }[];
}

const RECEPCION_PASSWORD = 'BulkDelete-Recepcion1!';

function samplePatient(suffix: string) {
  return {
    firstName: 'Bulk',
    lastName: `Patient ${suffix}`,
    documentId: `BULK-${suffix}`,
    dateOfBirth: '1990-01-01',
    phone: '+34600000000',
  };
}

describe('Patients — bulk "dar de baja"', () => {
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
    const recepcionEmail = `bulk-delete-recepcion-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, 'recepcion', 'Bulk', 'Recepcion')`,
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

  async function createPatient(token: string, suffix: string): Promise<string> {
    const res = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${token}`)
      .send(samplePatient(suffix));
    return (res.body as PatientResponse).id;
  }

  it('soft-deletes every valid id in one call and reports the count', async () => {
    const idOne = await createPatient(tokenA, 'one');
    const idTwo = await createPatient(tokenA, 'two');

    const res = await request(server)
      .post('/patients/bulk-delete')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ ids: [idOne, idTwo] });

    expect(res.status).toBe(200);
    const body = res.body as BulkDeleteResult;
    expect(body.deleted).toBe(2);
    expect(body.skipped).toHaveLength(0);

    const list = await request(server)
      .get('/patients?search=BULK-one')
      .set('Authorization', `Bearer ${tokenA}`);
    expect((list.body as PaginatedPatients).total).toBe(0);
  });

  it('skips an id that does not exist instead of failing the whole request', async () => {
    const idReal = await createPatient(tokenA, 'partial');
    const fakeId = randomUUID(); // well-formed v4, just not any real patient's

    const res = await request(server)
      .post('/patients/bulk-delete')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ ids: [idReal, fakeId] });

    expect(res.status).toBe(200);
    const body = res.body as BulkDeleteResult;
    expect(body.deleted).toBe(1);
    expect(body.skipped).toEqual([
      { id: fakeId, reason: 'Paciente no encontrado' },
    ]);
  });

  it("does not delete another tenant's patient even if its id is included", async () => {
    const foreignId = await createPatient(tokenB, 'foreign');
    const ownId = await createPatient(tokenA, 'own');

    const res = await request(server)
      .post('/patients/bulk-delete')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ ids: [ownId, foreignId] });

    expect(res.status).toBe(200);
    const body = res.body as BulkDeleteResult;
    expect(body.deleted).toBe(1);
    expect(body.skipped.map((s) => s.id)).toEqual([foreignId]);

    // Still visible from its own tenant — never touched.
    const stillThere = await request(server)
      .get('/patients?search=BULK-foreign')
      .set('Authorization', `Bearer ${tokenB}`);
    expect((stillThere.body as PaginatedPatients).total).toBe(1);
  });

  it('forbids recepcion from bulk-deleting patients', async () => {
    const id = await createPatient(tokenA, 'recepcion-blocked');

    const res = await request(server)
      .post('/patients/bulk-delete')
      .set('Authorization', `Bearer ${tokenRecepcion}`)
      .send({ ids: [id] });

    expect(res.status).toBe(403);
  });

  it('rejects an empty selection', async () => {
    const res = await request(server)
      .post('/patients/bulk-delete')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ ids: [] });

    expect(res.status).toBe(400);
  });

  it('rejects a selection containing a non-UUID value', async () => {
    const res = await request(server)
      .post('/patients/bulk-delete')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ ids: ['not-a-uuid'] });

    expect(res.status).toBe(400);
  });
});
