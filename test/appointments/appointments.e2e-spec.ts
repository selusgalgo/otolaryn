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

interface AppointmentResponse {
  id: string;
  tenantId: string;
  patientId: string;
  practitionerId: string | null;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  notes: string | null;
}

interface PaginatedAppointments {
  data: AppointmentResponse[];
  total: number;
  page: number;
  pageSize: number;
}

function decodeSub(token: string): string {
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
  ) as { sub: string };
  return payload.sub;
}

function slot(isoStart: string, durationMinutes = 30, practitionerId?: string) {
  return {
    scheduledAt: isoStart,
    durationMinutes,
    ...(practitionerId ? { practitionerId } : {}),
  };
}

describe('Agenda (appointments)', () => {
  let app: INestApplication;
  let server: Server;
  let owner: Pool;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let tokenA: string;
  let tokenB: string;
  let practitionerA: string;

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
    practitionerA = decodeSub(tokenA);
  }, 30000);

  afterAll(async () => {
    await app.close();
    await destroyTestTenants(owner, [tenantA, tenantB]);
    await owner.end();
  });

  it('creates an appointment for an own patient', async () => {
    const res = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(slot('2027-01-10T09:00:00.000Z'));

    expect(res.status).toBe(201);
    const body = res.body as AppointmentResponse;
    expect(body.patientId).toBe(tenantA.patientId);
    expect(body.status).toBe('scheduled');
  });

  it('returns 404 creating an appointment for a nonexistent patient', async () => {
    const res = await request(server)
      .post('/patients/00000000-0000-0000-0000-000000000000/appointments')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(slot('2027-01-10T09:30:00.000Z'));

    expect(res.status).toBe(404);
  });

  it("returns 404 creating an appointment for another tenant's patient", async () => {
    const res = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send(slot('2027-01-10T09:30:00.000Z'));

    expect(res.status).toBe(404);
  });

  it('blocks a second appointment for the same practitioner that overlaps an existing one', async () => {
    const created = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(slot('2027-02-01T10:00:00.000Z', 30, practitionerA));
    expect(created.status).toBe(201);

    const overlapping = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(slot('2027-02-01T10:15:00.000Z', 30, practitionerA));

    expect(overlapping.status).toBe(409);
  });

  it('does not block an overlapping appointment with no practitioner assigned', async () => {
    const first = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(slot('2027-03-01T11:00:00.000Z', 30));
    expect(first.status).toBe(201);

    const second = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(slot('2027-03-01T11:15:00.000Z', 30));

    expect(second.status).toBe(201);
  });

  it('frees up the slot once the conflicting appointment is cancelled', async () => {
    const created = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(slot('2027-04-01T12:00:00.000Z', 30, practitionerA));
    const id = (created.body as AppointmentResponse).id;

    const stillBlocked = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(slot('2027-04-01T12:00:00.000Z', 30, practitionerA));
    expect(stillBlocked.status).toBe(409);

    const cancel = await request(server)
      .patch(`/appointments/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'cancelled' });
    expect(cancel.status).toBe(200);
    expect((cancel.body as AppointmentResponse).status).toBe('cancelled');

    const nowAllowed = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(slot('2027-04-01T12:00:00.000Z', 30, practitionerA));
    expect(nowAllowed.status).toBe(201);
  });

  it('reschedules an appointment with PATCH', async () => {
    const created = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(slot('2027-05-01T09:00:00.000Z'));
    const id = (created.body as AppointmentResponse).id;

    const res = await request(server)
      .patch(`/appointments/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ scheduledAt: '2027-05-02T09:00:00.000Z' });

    expect(res.status).toBe(200);
    expect((res.body as AppointmentResponse).scheduledAt).toBe(
      '2027-05-02T09:00:00.000Z',
    );
  });

  // Regression: durationMinutes carried a class-property default (`= 30`)
  // on CreateAppointmentDto. UpdateAppointmentDto extends that via
  // PartialType, so class-transformer filled durationMinutes back in with
  // 30 on any PATCH that didn't explicitly send it — silently clobbering a
  // real, previously-set duration. Found by cancelling an appointment
  // (which only PATCHes { status }) through the real UI and watching its
  // duration revert from 45 to 30.
  it('does not reset durationMinutes to the create-time default on a status-only PATCH', async () => {
    const created = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(slot('2027-05-10T09:00:00.000Z', 45));
    const id = (created.body as AppointmentResponse).id;
    expect((created.body as AppointmentResponse).durationMinutes).toBe(45);

    const res = await request(server)
      .patch(`/appointments/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    expect((res.body as AppointmentResponse).durationMinutes).toBe(45);
    expect((res.body as AppointmentResponse).status).toBe('cancelled');
  });

  it('has no DELETE route — cancelling is a status change, not row removal', async () => {
    const created = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(slot('2027-06-01T09:00:00.000Z'));
    const id = (created.body as AppointmentResponse).id;

    const del = await request(server)
      .delete(`/appointments/${id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(404);

    const stillThere = await request(server)
      .get(`/appointments/${id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(stillThere.status).toBe(200);
  });

  it('hides an appointment from a different tenant on GET by id', async () => {
    const created = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send(slot('2027-07-01T09:00:00.000Z'));
    const id = (created.body as AppointmentResponse).id;

    const asOther = await request(server)
      .get(`/appointments/${id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(asOther.status).toBe(404);
  });

  it('filters the agenda by date range', async () => {
    const res = await request(server)
      .get(
        '/appointments?from=2030-01-01T00:00:00.000Z&to=2030-01-02T00:00:00.000Z',
      )
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect((res.body as PaginatedAppointments).data).toHaveLength(0);
  });

  it('filters the agenda by practitionerId', async () => {
    const res = await request(server)
      .get(`/appointments?practitionerId=${practitionerA}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const body = res.body as PaginatedAppointments;
    expect(body.data.every((a) => a.practitionerId === practitionerA)).toBe(
      true,
    );
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('filters the agenda by patientId', async () => {
    const res = await request(server)
      .get(`/appointments?patientId=${tenantA.patientId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const body = res.body as PaginatedAppointments;
    expect(body.data.every((a) => a.patientId === tenantA.patientId)).toBe(
      true,
    );
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("never lists tenant A's appointments through tenant B credentials", async () => {
    const res = await request(server)
      .get('/appointments')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    const body = res.body as PaginatedAppointments;
    expect(body.data.every((a) => a.tenantId === tenantB.id)).toBe(true);
  });
});
