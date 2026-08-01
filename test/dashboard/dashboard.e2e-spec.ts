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
  clinicalEntries: ClinicalEntryResponse[];
}

const SECOND_PROFESSIONAL_PASSWORD = 'DashboardTest-Passw0rd!';

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
  const today = todayIso();

  beforeAll(async () => {
    owner = ownerPool();
    [tenantA, tenantB] = await createTestTenants(owner);

    // createTestTenants seeds one user per tenant — a second professional
    // inside tenant A is needed to prove one professional never sees
    // another's data within the *same* tenant (RLS alone can't catch that,
    // since both are legitimately inside the tenant boundary).
    const passwordHash = await argon2.hash(SECOND_PROFESSIONAL_PASSWORD, {
      type: argon2.argon2id,
    });
    const secondEmail = `second-professional-${Date.now()}@rls-test.local`;
    const {
      rows: [{ id: secondId }],
    } = await owner.query<{ id: string }>(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, 'staff', 'Segundo', 'Profesional') RETURNING id`,
      [tenantA.id, secondEmail, passwordHash],
    );
    secondProfessionalUserId = secondId;

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

    tokenA = (loginA.body as LoginResponse).accessToken;
    tokenB = (loginB.body as LoginResponse).accessToken;
    secondProfessionalToken = (loginSecond.body as LoginResponse).accessToken;
    expect(tokenA).toBeDefined();
    expect(tokenB).toBeDefined();
    expect(secondProfessionalToken).toBeDefined();
    userIdA = decodeSub(tokenA);
  }, 30000);

  afterAll(async () => {
    await app.close();
    await destroyTestTenants(owner, [tenantA, tenantB]);
    await owner.end();
  });

  it("only returns today's appointments assigned to me or unassigned — never a colleague's", async () => {
    const mine = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        scheduledAt: `${today}T09:00:00.000Z`,
        practitionerId: userIdA,
      });
    expect(mine.status).toBe(201);

    const colleagues = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        scheduledAt: `${today}T10:00:00.000Z`,
        practitionerId: secondProfessionalUserId,
      });
    expect(colleagues.status).toBe(201);

    const unassigned = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ scheduledAt: `${today}T11:00:00.000Z` });
    expect(unassigned.status).toBe(201);

    const res = await request(server)
      .get(`/dashboard/today?date=${today}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const body = res.body as TodayDashboardResponse;
    const ids = body.appointments.map((a) => a.id);
    expect(ids).toContain((mine.body as AppointmentResponse).id);
    expect(ids).toContain((unassigned.body as AppointmentResponse).id);
    expect(ids).not.toContain((colleagues.body as AppointmentResponse).id);
  });

  it("only returns today's clinical entries I authored — never a colleague's", async () => {
    const mine = await request(server)
      .post(`/patients/${tenantA.patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ chiefComplaint: 'Revision propia de hoy' });
    expect(mine.status).toBe(201);

    const colleagues = await request(server)
      .post(`/patients/${tenantA.patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${secondProfessionalToken}`)
      .send({ chiefComplaint: 'Revision del colega de hoy' });
    expect(colleagues.status).toBe(201);

    const res = await request(server)
      .get(`/dashboard/today?date=${today}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const body = res.body as TodayDashboardResponse;
    const ids = body.clinicalEntries.map((e) => e.id);
    expect(ids).toContain((mine.body as ClinicalEntryResponse).id);
    expect(ids).not.toContain((colleagues.body as ClinicalEntryResponse).id);
  });

  it("never leaks another tenant's appointments or clinical entries", async () => {
    const otherAppointment = await request(server)
      .post(`/patients/${tenantB.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ scheduledAt: `${today}T12:00:00.000Z` });
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
      body.clinicalEntries.some(
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
