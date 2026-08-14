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

interface UserResponse {
  id: string;
  email: string;
  role: string;
  [key: string]: unknown;
}

interface TenantResponse {
  id: string;
  name: string;
}

interface AppointmentResponse {
  id: string;
  practitionerId: string | null;
}

interface PatientResponse {
  id: string;
}

const PROFESIONAL_PASSWORD = 'RolesTest-Profesional1!';
const RECEPCION_PASSWORD = 'RolesTest-Recepcion1!';
const SUPERADMIN_PASSWORD = 'RolesTest-Superadmin1!';

function decodeSub(token: string): string {
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
  ) as { sub: string };
  return payload.sub;
}

describe('Roles — RolesGuard + scoping matrix', () => {
  let app: INestApplication;
  let server: Server;
  let owner: Pool;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let tokenAdmin: string;
  let tokenProfesional: string;
  let tokenRecepcion: string;
  let tokenSuperadmin: string;
  let superadminEmail: string;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    owner = ownerPool();
    [tenantA, tenantB] = await createTestTenants(owner);

    const profesionalHash = await argon2.hash(PROFESIONAL_PASSWORD, {
      type: argon2.argon2id,
    });
    const profesionalEmail = `roles-profesional-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, 'profesional', 'Roles', 'Profesional')`,
      [tenantA.id, profesionalEmail, profesionalHash],
    );

    const recepcionHash = await argon2.hash(RECEPCION_PASSWORD, {
      type: argon2.argon2id,
    });
    const recepcionEmail = `roles-recepcion-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, 'recepcion', 'Roles', 'Recepcion')`,
      [tenantA.id, recepcionEmail, recepcionHash],
    );

    const superadminHash = await argon2.hash(SUPERADMIN_PASSWORD, {
      type: argon2.argon2id,
    });
    superadminEmail = `roles-superadmin-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES (NULL, $1, $2, 'superadmin', 'Roles', 'Superadmin')`,
      [superadminEmail, superadminHash],
    );

    app = await createTestApp();
    server = app.getHttpServer() as Server;

    const loginAdmin = await request(server)
      .post('/auth/login')
      .send({ identifier: tenantA.userEmail, password: tenantA.userPassword });
    const loginProfesional = await request(server)
      .post('/auth/login')
      .send({ identifier: profesionalEmail, password: PROFESIONAL_PASSWORD });
    const loginRecepcion = await request(server)
      .post('/auth/login')
      .send({ identifier: recepcionEmail, password: RECEPCION_PASSWORD });
    const loginSuperadmin = await request(server)
      .post('/auth/login')
      .send({ identifier: superadminEmail, password: SUPERADMIN_PASSWORD });

    tokenAdmin = (loginAdmin.body as LoginResponse).accessToken;
    tokenProfesional = (loginProfesional.body as LoginResponse).accessToken;
    tokenRecepcion = (loginRecepcion.body as LoginResponse).accessToken;
    tokenSuperadmin = (loginSuperadmin.body as LoginResponse).accessToken;
    expect(tokenAdmin).toBeDefined();
    expect(tokenProfesional).toBeDefined();
    expect(tokenRecepcion).toBeDefined();
    expect(tokenSuperadmin).toBeDefined();
  }, 30000);

  afterAll(async () => {
    await app.close();
    await destroyTestTenants(owner, [tenantA, tenantB]);
    if (createdTenantIds.length > 0) {
      await owner.query(
        `DELETE FROM iam.users WHERE tenant_id = ANY($1::uuid[])`,
        [createdTenantIds],
      );
      await owner.query(`DELETE FROM iam.tenants WHERE id = ANY($1::uuid[])`, [
        createdTenantIds,
      ]);
    }
    await owner.query(`DELETE FROM iam.users WHERE email = $1`, [
      superadminEmail,
    ]);
    await owner.end();
  });

  it('blocks superadmin from every tenant-scoped route', async () => {
    const patients = await request(server)
      .get('/patients')
      .set('Authorization', `Bearer ${tokenSuperadmin}`);
    expect(patients.status).toBe(403);

    const appointments = await request(server)
      .get('/appointments')
      .set('Authorization', `Bearer ${tokenSuperadmin}`);
    expect(appointments.status).toBe(403);

    const dashboard = await request(server)
      .get('/dashboard/today?date=2027-01-01')
      .set('Authorization', `Bearer ${tokenSuperadmin}`);
    expect(dashboard.status).toBe(403);
  });

  it('blocks admin/profesional/recepcion from every platform (cross-tenant) route', async () => {
    for (const token of [tokenAdmin, tokenProfesional, tokenRecepcion]) {
      const list = await request(server)
        .get('/platform/tenants')
        .set('Authorization', `Bearer ${token}`);
      expect(list.status).toBe(403);
    }
  });

  it('lets superadmin list and create tenants, each with a working admin login', async () => {
    const list = await request(server)
      .get('/platform/tenants')
      .set('Authorization', `Bearer ${tokenSuperadmin}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);

    const newAdminEmail = `roles-new-admin-${Date.now()}@rls-test.local`;
    const created = await request(server)
      .post('/platform/tenants')
      .set('Authorization', `Bearer ${tokenSuperadmin}`)
      .send({
        name: `Roles-Test-New-Clinic-${Date.now()}`,
        adminEmail: newAdminEmail,
        adminFirstName: 'Nueva',
        adminLastName: 'Clinica',
        adminPassword: 'RolesTest-NewAdmin1!',
      });
    expect(created.status).toBe(201);
    createdTenantIds.push((created.body as TenantResponse).id);

    const loginNewAdmin = await request(server)
      .post('/auth/login')
      .send({ identifier: newAdminEmail, password: 'RolesTest-NewAdmin1!' });
    expect(loginNewAdmin.status).toBe(200);
    expect((loginNewAdmin.body as LoginResponse).accessToken).toBeDefined();
  });

  it('excludes recepcion from clinical entries entirely', async () => {
    const create = await request(server)
      .post(`/patients/${tenantA.patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${tokenRecepcion}`)
      .send({ chiefComplaint: 'No deberia poder crear esto' });
    expect(create.status).toBe(403);

    const list = await request(server)
      .get(`/patients/${tenantA.patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${tokenRecepcion}`);
    expect(list.status).toBe(403);
  });

  it('lets recepcion look up profesionales but not create/manage users', async () => {
    const list = await request(server)
      .get('/users?role=profesional')
      .set('Authorization', `Bearer ${tokenRecepcion}`);
    expect(list.status).toBe(200);

    const create = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${tokenRecepcion}`)
      .send({
        email: `roles-blocked-${Date.now()}@rls-test.local`,
        firstName: 'No',
        lastName: 'Deberia',
        password: 'RolesTest-Blocked1!',
        role: 'profesional',
      });
    expect(create.status).toBe(403);
  });

  it('blocks profesional from /users entirely', async () => {
    const res = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${tokenProfesional}`);
    expect(res.status).toBe(403);
  });

  it('lets admin create a user in their own tenant, never exposing the password hash', async () => {
    const email = `roles-created-by-admin-${Date.now()}@rls-test.local`;
    const created = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        email,
        firstName: 'Creado',
        lastName: 'PorAdmin',
        password: 'RolesTest-CreatedUser1!',
        role: 'profesional',
      });
    expect(created.status).toBe(201);
    const body = created.body as UserResponse;
    expect(body.email).toBe(email);
    expect(body).not.toHaveProperty('passwordHash');
    expect(body).not.toHaveProperty('password_hash');

    const login = await request(server)
      .post('/auth/login')
      .send({ identifier: email, password: 'RolesTest-CreatedUser1!' });
    expect(login.status).toBe(200);
  });

  it('hides a patient from profesional until they have an appointment or entry with them, then shows it', async () => {
    const notYetLinked = await request(server)
      .get(`/patients/${tenantA.patientId}`)
      .set('Authorization', `Bearer ${tokenProfesional}`);
    expect(notYetLinked.status).toBe(404);

    const appointment = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenProfesional}`)
      .send({ scheduledAt: '2027-08-01T09:00:00.000Z', durationMinutes: 30 });
    expect(appointment.status).toBe(201);
    // profesional can't set practitionerId themselves — it's always forced
    // to their own id server-side.
    expect(
      (appointment.body as AppointmentResponse).practitionerId,
    ).toBeTruthy();

    const nowLinked = await request(server)
      .get(`/patients/${tenantA.patientId}`)
      .set('Authorization', `Bearer ${tokenProfesional}`);
    expect(nowLinked.status).toBe(200);
    expect((nowLinked.body as PatientResponse).id).toBe(tenantA.patientId);
  });

  it("blocks profesional from modifying a colleague's appointment", async () => {
    // Assigned to the admin's own user id — any iam.users id works as a
    // practitioner FK-wise, and the point here is just that it's *not*
    // tokenProfesional's own id, so this appointment is a "colleague's".
    const created = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        scheduledAt: '2027-08-15T09:00:00.000Z',
        durationMinutes: 30,
        practitionerId: decodeSub(tokenAdmin),
      });
    expect(created.status).toBe(201);

    const patch = await request(server)
      .patch(`/appointments/${(created.body as AppointmentResponse).id}`)
      .set('Authorization', `Bearer ${tokenProfesional}`)
      .send({ status: 'cancelled' });
    expect(patch.status).toBe(403);
  });
});
