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

interface AppointmentResponse {
  id: string;
  patientId: string;
  practitionerId: string | null;
  scheduledAt: string;
}

interface ClinicalEntryResponse {
  id: string;
  patientId: string;
  authorUserId: string;
}

interface TodayDashboardResponse {
  appointments: AppointmentResponse[];
  clinicalEntries: ClinicalEntryResponse[] | null;
}

const SECOND_PROFESSIONAL_PASSWORD = 'DashboardTest-Passw0rd!';
const RECEPCION_PASSWORD = 'DashboardTest-Recepcion1!';

function decodeSub(token: string): string {
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
  ) as { sub: string };
  return payload.sub;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

describe('Dashboard (Escritorio) — Hoy', () => {
  let app: INestApplication;
  let server: Server;
  let owner: Pool;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let tokenA: string;
  let tokenB: string;
  let userIdA: string;
  let secondProfessionalToken: string;
  let secondProfessionalUserId: string;
  let recepcionToken: string;
  const today = todayIso();

  beforeAll(async () => {
    owner = ownerPool();
    [tenantA, tenantB] = await createTestTenants(owner);

    // createTestTenants only seeds one 'admin' user per tenant — a
    // 'profesional' and a 'recepcion' inside tenant A are needed to prove
    // dashboard visibility actually differs by role, not just by tenant
    // (RLS alone can't catch that, since all three are legitimately inside
    // the same tenant boundary).
    const passwordHash = await argon2.hash(SECOND_PROFESSIONAL_PASSWORD, {
      type: argon2.argon2id,
    });
    const secondEmail = `second-professional-${Date.now()}@rls-test.local`;
    const {
      rows: [{ id: secondId }],
    } = await owner.query<{ id: string }>(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, 'profesional', 'Segundo', 'Profesional') RETURNING id`,
      [tenantA.id, secondEmail, passwordHash],
    );
    secondProfessionalUserId = secondId;

    const recepcionPasswordHash = await argon2.hash(RECEPCION_PASSWORD, {
      type: argon2.argon2id,
    });
    const recepcionEmail = `recepcion-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, 'recepcion', 'Recepcion', 'Test') RETURNING id`,
      [tenantA.id, recepcionEmail, recepcionPasswordHash],
    );

    app = await createTestApp();
    server = app.getHttpServer() as Server;

    const loginA = await request(server)
      .post('/auth/login')
      .send({ email: tenantA.userEmail, password: tenantA.userPassword });
    const loginB = await request(server)
      .post('/auth/login')
      .send({ email: tenantB.userEmail, password: tenantB.userPassword });
    const loginSecond = await request(server)
      .post('/auth/login')
      .send({ email: secondEmail, password: SECOND_PROFESSIONAL_PASSWORD });
    const loginRecepcion = await request(server)
      .post('/auth/login')
      .send({ email: recepcionEmail, password: RECEPCION_PASSWORD });

    tokenA = (loginA.body as LoginResponse).accessToken;
    tokenB = (loginB.body as LoginResponse).accessToken;
    secondProfessionalToken = (loginSecond.body as LoginResponse).accessToken;
    recepcionToken = (loginRecepcion.body as LoginResponse).accessToken;
    expect(tokenA).toBeDefined();
    expect(tokenB).toBeDefined();
    expect(secondProfessionalToken).toBeDefined();
    expect(recepcionToken).toBeDefined();
    userIdA = decodeSub(tokenA);
  }, 30000);

  afterAll(async () => {
    await app.close();
    await destroyTestTenants(owner, [tenantA, tenantB]);
    await owner.end();
  });

  it("admin sees every professional's appointments today; profesional sees only their own", async () => {
    const adminOwn = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        scheduledAt: `${today}T09:00:00.000Z`,
        practitionerId: userIdA,
      });
    expect(adminOwn.status).toBe(201);

    const colleague = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        scheduledAt: `${today}T10:00:00.000Z`,
        practitionerId: secondProfessionalUserId,
      });
    expect(colleague.status).toBe(201);

    const adminView = await request(server)
      .get(`/dashboard/today?date=${today}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(adminView.status).toBe(200);
    const adminIds = (
      adminView.body as TodayDashboardResponse
    ).appointments.map((a) => a.id);
    expect(adminIds).toContain((adminOwn.body as AppointmentResponse).id);
    expect(adminIds).toContain((colleague.body as AppointmentResponse).id);

    const profesionalView = await request(server)
      .get(`/dashboard/today?date=${today}`)
      .set('Authorization', `Bearer ${secondProfessionalToken}`);
    expect(profesionalView.status).toBe(200);
    const profesionalIds = (
      profesionalView.body as TodayDashboardResponse
    ).appointments.map((a) => a.id);
    expect(profesionalIds).toContain(
      (colleague.body as AppointmentResponse).id,
    );
    expect(profesionalIds).not.toContain(
      (adminOwn.body as AppointmentResponse).id,
    );
  });

  it('rejects creating an appointment with no practitionerId for admin/recepcion', async () => {
    const res = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ scheduledAt: `${today}T11:00:00.000Z` });
    expect(res.status).toBe(400);
  });

  it('admin sees every clinical entry today; profesional sees only their own', async () => {
    const adminEntry = await request(server)
      .post(`/patients/${tenantA.patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ chiefComplaint: 'Revision del admin de hoy' });
    expect(adminEntry.status).toBe(201);

    const colleagueEntry = await request(server)
      .post(`/patients/${tenantA.patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${secondProfessionalToken}`)
      .send({ chiefComplaint: 'Revision del colega de hoy' });
    expect(colleagueEntry.status).toBe(201);

    const adminView = await request(server)
      .get(`/dashboard/today?date=${today}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(adminView.status).toBe(200);
    const adminIds = (
      (adminView.body as TodayDashboardResponse).clinicalEntries ?? []
    ).map((e) => e.id);
    expect(adminIds).toContain((adminEntry.body as ClinicalEntryResponse).id);
    expect(adminIds).toContain(
      (colleagueEntry.body as ClinicalEntryResponse).id,
    );

    const profesionalView = await request(server)
      .get(`/dashboard/today?date=${today}`)
      .set('Authorization', `Bearer ${secondProfessionalToken}`);
    expect(profesionalView.status).toBe(200);
    const profesionalIds = (
      (profesionalView.body as TodayDashboardResponse).clinicalEntries ?? []
    ).map((e) => e.id);
    expect(profesionalIds).toContain(
      (colleagueEntry.body as ClinicalEntryResponse).id,
    );
    expect(profesionalIds).not.toContain(
      (adminEntry.body as ClinicalEntryResponse).id,
    );
  });

  it('shows recepcion the full agenda today but no clinical-entries widget at all', async () => {
    const res = await request(server)
      .get(`/dashboard/today?date=${today}`)
      .set('Authorization', `Bearer ${recepcionToken}`);

    expect(res.status).toBe(200);
    const body = res.body as TodayDashboardResponse;
    expect(Array.isArray(body.appointments)).toBe(true);
    // Not just empty — omitted entirely, so a client can't accidentally
    // render a "no entries" clinical widget for a role that shouldn't see
    // one at all.
    expect(body.clinicalEntries).toBeNull();
  });

  it("never leaks another tenant's appointments or clinical entries", async () => {
    const otherAppointment = await request(server)
      .post(`/patients/${tenantB.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        scheduledAt: `${today}T12:00:00.000Z`,
        practitionerId: decodeSub(tokenB),
      });
    expect(otherAppointment.status).toBe(201);

    const otherEntry = await request(server)
      .post(`/patients/${tenantB.patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ chiefComplaint: 'Consulta de otro tenant' });
    expect(otherEntry.status).toBe(201);

    const res = await request(server)
      .get(`/dashboard/today?date=${today}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const body = res.body as TodayDashboardResponse;
    expect(
      body.appointments.some(
        (a) => a.id === (otherAppointment.body as AppointmentResponse).id,
      ),
    ).toBe(false);
    expect(
      (body.clinicalEntries ?? []).some(
        (e) => e.id === (otherEntry.body as ClinicalEntryResponse).id,
      ),
    ).toBe(false);
  });

  it('never includes any billing-related field in the response', async () => {
    const res = await request(server)
      .get(`/dashboard/today?date=${today}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body).toLowerCase();
    for (const forbidden of [
      'invoice',
      'billing',
      'payment',
      'stripe',
      'amount',
      'price',
      'cobro',
      'factura',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('rejects the request without a date query param', async () => {
    const res = await request(server)
      .get('/dashboard/today')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
  });
});
