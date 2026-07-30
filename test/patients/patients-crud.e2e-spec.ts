import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
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
  tenantId: string;
  firstName: string;
  lastName: string;
  documentId: string;
  dateOfBirth: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
}

interface PaginatedPatients {
  data: PatientResponse[];
  total: number;
  page: number;
  pageSize: number;
}

// documentId must stay under CreatePatientDto's 20-char limit (a real
// DNI/NIE/passport never gets close to that) and, unlike lastName, needs to
// be *deterministic* per suffix — some tests call samplePatient() with the
// same suffix twice on purpose, to create an intentional document_id
// collision. A short hash keeps both properties: same suffix -> same id,
// any suffix -> fits the limit.
function shortHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function samplePatient(suffix: string) {
  return {
    firstName: 'Test',
    lastName: `Patient ${suffix}`,
    documentId: `D-${shortHash(suffix)}`,
    dateOfBirth: '1992-05-01',
    phone: '+34611111111',
  };
}

describe('Patients CRUD', () => {
  let app: INestApplication;
  let server: Server;
  let owner: Pool;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    owner = ownerPool();
    [tenantA, tenantB] = await createTestTenants(owner);

    app = await createTestApp();
    server = app.getHttpServer() as Server;

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

  it('creates a patient and returns it with the fields supplied', async () => {
    const payload = samplePatient('create');
    const res = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(payload);

    expect(res.status).toBe(201);
    const body = res.body as PatientResponse;
    expect(body.firstName).toBe('Test');
    expect(body.lastName).toBe('Patient create');
    expect(body.documentId).toBe(payload.documentId);
    expect(body.tenantId).toBe(tenantA.id);
  });

  it('rejects a payload missing a required field', async () => {
    const incomplete: Partial<ReturnType<typeof samplePatient>> =
      samplePatient('incomplete');
    delete incomplete.firstName;

    const res = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(incomplete);

    expect(res.status).toBe(400);
  });

  it('rejects a payload with an unknown field', async () => {
    const res = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ ...samplePatient('unknown-field'), notARealField: 'nope' });

    expect(res.status).toBe(400);
  });

  it('fetches a created patient by id', async () => {
    const created = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(samplePatient('fetch-by-id'));

    const id = (created.body as PatientResponse).id;

    const res = await request(server)
      .get(`/patients/${id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect((res.body as PatientResponse).id).toBe(id);
  });

  it('returns 404 for a nonexistent patient id', async () => {
    const res = await request(server)
      .get('/patients/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed patient id', async () => {
    const res = await request(server)
      .get('/patients/not-a-uuid')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
  });

  it('updates a patient with PATCH', async () => {
    const created = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(samplePatient('update'));

    const id = (created.body as PatientResponse).id;

    const res = await request(server)
      .patch(`/patients/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ phone: '+34699999999' });

    expect(res.status).toBe(200);
    expect((res.body as PatientResponse).phone).toBe('+34699999999');
    expect((res.body as PatientResponse).lastName).toBe('Patient update');
  });

  it('soft-deletes a patient: it disappears from GET by id and from the list, but the document_id becomes reusable', async () => {
    const created = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(samplePatient('soft-delete'));
    const id = (created.body as PatientResponse).id;

    const del = await request(server)
      .delete(`/patients/${id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(204);

    const getAfterDelete = await request(server)
      .get(`/patients/${id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(getAfterDelete.status).toBe(404);

    const list = await request(server)
      .get('/patients?pageSize=100')
      .set('Authorization', `Bearer ${tokenA}`);
    const ids = (list.body as PaginatedPatients).data.map((p) => p.id);
    expect(ids).not.toContain(id);

    // Same document_id, reused after the soft-delete — must be allowed.
    const recreated = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(samplePatient('soft-delete'));
    expect(recreated.status).toBe(201);
  });

  it('rejects a duplicate document_id within the same tenant with 409', async () => {
    await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(samplePatient('duplicate'));

    const res = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(samplePatient('duplicate'));

    expect(res.status).toBe(409);
  });

  // Regression: a stray leading/trailing space made " 00000002B" and
  // "00000002B" look like different documentIds to the DB's unique index,
  // silently defeating the "no duplicate patient" guarantee — found by the
  // user creating what looked like a duplicate through the real UI.
  it('rejects a duplicate document_id even when padded with whitespace', async () => {
    const base = samplePatient('whitespace-duplicate');
    await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(base);

    const res = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ ...base, documentId: `  ${base.documentId}  ` });

    expect(res.status).toBe(409);
  });

  it('trims whitespace from text fields before saving', async () => {
    const payload = samplePatient('trim-check');
    const res = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        ...payload,
        firstName: `  ${payload.firstName}  `,
        phone: `  ${payload.phone}  `,
      });

    expect(res.status).toBe(201);
    const body = res.body as PatientResponse;
    expect(body.firstName).toBe(payload.firstName);
    expect(body.phone).toBe(payload.phone);
  });

  it('allows the same document_id to be reused across different tenants', async () => {
    await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(samplePatient('cross-tenant-shared-doc'));

    const res = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenB}`)
      .send(samplePatient('cross-tenant-shared-doc'));

    expect(res.status).toBe(201);
  });

  it('never lists or returns tenant A patients through tenant B credentials', async () => {
    const created = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(samplePatient('isolation-check'));
    const id = (created.body as PatientResponse).id;

    const getAsB = await request(server)
      .get(`/patients/${id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(getAsB.status).toBe(404);

    const listAsB = await request(server)
      .get('/patients?pageSize=100')
      .set('Authorization', `Bearer ${tokenB}`);
    const idsAsB = (listAsB.body as PaginatedPatients).data.map((p) => p.id);
    expect(idsAsB).not.toContain(id);
  });

  it('paginates results honoring page and pageSize', async () => {
    for (let i = 0; i < 3; i++) {
      await request(server)
        .post('/patients')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(samplePatient(`page-${i}`));
    }

    const page1 = await request(server)
      .get('/patients?page=1&pageSize=1')
      .set('Authorization', `Bearer ${tokenA}`);
    const page2 = await request(server)
      .get('/patients?page=2&pageSize=1')
      .set('Authorization', `Bearer ${tokenA}`);

    expect((page1.body as PaginatedPatients).data).toHaveLength(1);
    expect((page2.body as PaginatedPatients).data).toHaveLength(1);
    expect((page1.body as PaginatedPatients).data[0].id).not.toBe(
      (page2.body as PaginatedPatients).data[0].id,
    );
    expect((page1.body as PaginatedPatients).total).toBeGreaterThanOrEqual(4);
  });

  it('searches by first name, last name, and document id, case-insensitively', async () => {
    const created = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        ...samplePatient('search-target'),
        firstName: 'Zaragoza',
        lastName: 'Villalobos',
      });
    const id = (created.body as PatientResponse).id;
    const documentId = (created.body as PatientResponse).documentId;

    for (const search of ['zarago', 'VILLALOBOS', documentId.toLowerCase()]) {
      const res = await request(server)
        .get(`/patients?search=${encodeURIComponent(search)}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      const ids = (res.body as PaginatedPatients).data.map((p) => p.id);
      expect(ids).toContain(id);
    }
  });

  it("never matches another tenant's patients when searching", async () => {
    const created = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        ...samplePatient('cross-tenant-search'),
        firstName: 'Cupertino',
      });

    const res = await request(server)
      .get('/patients?search=Cupertino')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const ids = (res.body as PaginatedPatients).data.map((p) => p.id);
    expect(ids).not.toContain((created.body as PatientResponse).id);
  });
});
