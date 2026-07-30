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

interface ClinicalEntryResponse {
  id: string;
  tenantId: string;
  patientId: string;
  authorUserId: string;
  chiefComplaint: string;
  diagnosis: string | null;
}

interface PaginatedEntries {
  data: ClinicalEntryResponse[];
  total: number;
  page: number;
  pageSize: number;
}

function sampleEntry(complaint = 'Dolor de garganta') {
  return {
    chiefComplaint: complaint,
    examinationFindings: 'Faringe eritematosa',
    diagnosis: 'Faringitis aguda',
    treatment: 'Ibuprofeno 400mg/8h',
  };
}

describe('Historia clinica (clinical entries)', () => {
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

  it('creates a clinical entry for an own patient, with authorUserId taken from the JWT', async () => {
    const res = await request(server)
      .post(`/patients/${tenantA.patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(sampleEntry());

    expect(res.status).toBe(201);
    const body = res.body as ClinicalEntryResponse;
    expect(body.patientId).toBe(tenantA.patientId);
    expect(body.authorUserId).toBeTruthy();
  });

  it('rejects a payload that tries to set authorUserId directly, instead of silently ignoring it', async () => {
    const res = await request(server)
      .post(`/patients/${tenantA.patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ ...sampleEntry(), authorUserId: 'attacker-supplied-id' });

    expect(res.status).toBe(400);
  });

  it('rejects a payload missing chiefComplaint', async () => {
    const res = await request(server)
      .post(`/patients/${tenantA.patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ diagnosis: 'sin motivo de consulta' });

    expect(res.status).toBe(400);
  });

  it('returns 404 creating an entry for a nonexistent patient id', async () => {
    const res = await request(server)
      .post('/patients/00000000-0000-0000-0000-000000000000/clinical-entries')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(sampleEntry());

    expect(res.status).toBe(404);
  });

  it("returns 404 creating an entry for another tenant's patient (RLS hides it, not a permissions message)", async () => {
    const res = await request(server)
      .post(`/patients/${tenantA.patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send(sampleEntry());

    expect(res.status).toBe(404);
  });

  it('lists entries for a patient, paginated', async () => {
    await request(server)
      .post(`/patients/${tenantA.patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(sampleEntry('Revision de seguimiento'));

    const res = await request(server)
      .get(`/patients/${tenantA.patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const body = res.body as PaginatedEntries;
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((e) => e.patientId === tenantA.patientId)).toBe(
      true,
    );
  });

  it("never lists tenant A's clinical entries through tenant B credentials", async () => {
    const res = await request(server)
      .get(`/patients/${tenantA.patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${tokenB}`);

    // Tenant B can't even resolve tenant A's patientId (RLS hides it),
    // so this 404s rather than returning an empty/filtered list.
    expect(res.status).toBe(404);
  });

  it('fetches a single entry by id and hides it from a different tenant', async () => {
    const created = await request(server)
      .post(`/patients/${tenantA.patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(sampleEntry());
    const id = (created.body as ClinicalEntryResponse).id;

    const asOwner = await request(server)
      .get(`/clinical-entries/${id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(asOwner.status).toBe(200);

    const asOther = await request(server)
      .get(`/clinical-entries/${id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(asOther.status).toBe(404);
  });

  it('exposes no PATCH or DELETE for a clinical entry — history is append-only', async () => {
    const created = await request(server)
      .post(`/patients/${tenantA.patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(sampleEntry());
    const id = (created.body as ClinicalEntryResponse).id;

    const patchRes = await request(server)
      .patch(`/clinical-entries/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ diagnosis: 'attempted edit' });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(server)
      .delete(`/clinical-entries/${id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(deleteRes.status).toBe(404);

    const stillThere = await request(server)
      .get(`/clinical-entries/${id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(stillThere.status).toBe(200);
    expect((stillThere.body as ClinicalEntryResponse).diagnosis).not.toBe(
      'attempted edit',
    );
  });
});
