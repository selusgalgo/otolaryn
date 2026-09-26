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
    [tenantA, tenantB] = await createTestTenants(owner, { openAllHours: true });

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

  it('lets admin edit and reset the password of a user in their own tenant, but not profesional/recepcion', async () => {
    const email = `roles-editable-${Date.now()}@rls-test.local`;
    const created = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        email,
        firstName: 'Original',
        lastName: 'Apellido',
        password: 'RolesTest-Editable1!',
        role: 'recepcion',
      });
    const userId = (created.body as UserResponse).id;

    for (const token of [tokenProfesional, tokenRecepcion]) {
      const blocked = await request(server)
        .patch(`/users/${userId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'No deberia aplicar' });
      expect(blocked.status).toBe(403);
    }

    const update = await request(server)
      .patch(`/users/${userId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ firstName: 'Editado' });
    expect(update.status).toBe(200);
    expect((update.body as UserResponse).firstName).toBe('Editado');

    const reset = await request(server)
      .patch(`/users/${userId}/password`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ newPassword: 'RolesTest-Reset1!' });
    expect(reset.status).toBe(200);

    const oldLogin = await request(server)
      .post('/auth/login')
      .send({ identifier: email, password: 'RolesTest-Editable1!' });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(server)
      .post('/auth/login')
      .send({ identifier: email, password: 'RolesTest-Reset1!' });
    expect(newLogin.status).toBe(200);
  });

  // The owner-doctor case: an admin who also sees patients. staffFunction
  // is additive (keeps every admin capability, see roles.guard/RolesGuard —
  // nothing here changes), it only changes who GET /users?bookable=true
  // returns for the practitioner picker.
  it('lets an admin with staffFunction=profesional appear in the bookable-practitioners list', async () => {
    const email = `roles-owner-doctor-${Date.now()}@rls-test.local`;
    const created = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        email,
        firstName: 'Dueño',
        lastName: 'Doctor',
        password: 'RolesTest-OwnerDoctor1!',
        role: 'admin',
        staffFunction: 'profesional',
      });
    expect(created.status).toBe(201);
    const body = created.body as UserResponse;
    expect(body.role).toBe('admin');
    expect(body.staffFunction).toBe('profesional');

    const bookable = await request(server)
      .get('/users?bookable=true')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(bookable.status).toBe(200);
    const ids = (bookable.body as UserResponse[]).map((u) => u.id);
    expect(ids).toContain(body.id);
  });

  it('excludes a plain admin (no staffFunction) from the bookable-practitioners list', async () => {
    const email = `roles-plain-admin-${Date.now()}@rls-test.local`;
    const created = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        email,
        firstName: 'Solo',
        lastName: 'Administrador',
        password: 'RolesTest-PlainAdmin1!',
        role: 'admin',
      });
    expect(created.status).toBe(201);
    expect((created.body as UserResponse).staffFunction).toBeNull();

    const bookable = await request(server)
      .get('/users?bookable=true')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    const ids = (bookable.body as UserResponse[]).map((u) => u.id);
    expect(ids).not.toContain((created.body as UserResponse).id);
  });

  it('ignores staffFunction for a non-admin role and clears it if role changes away from admin', async () => {
    const email = `roles-staff-function-ignored-${Date.now()}@rls-test.local`;
    const created = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        email,
        firstName: 'Recepcion',
        lastName: 'ConFuncion',
        password: 'RolesTest-Ignored1!',
        role: 'recepcion',
        staffFunction: 'profesional',
      });
    expect(created.status).toBe(201);
    expect((created.body as UserResponse).staffFunction).toBeNull();
    const userId = (created.body as UserResponse).id;

    const promoted = await request(server)
      .patch(`/users/${userId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ role: 'admin', staffFunction: 'profesional' });
    expect(promoted.status).toBe(200);
    expect((promoted.body as UserResponse).staffFunction).toBe('profesional');

    const demoted = await request(server)
      .patch(`/users/${userId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ role: 'recepcion' });
    expect(demoted.status).toBe(200);
    expect((demoted.body as UserResponse).staffFunction).toBeNull();
  });

  it('lets admin delete a user in their own tenant', async () => {
    const email = `roles-deletable-${Date.now()}@rls-test.local`;
    const created = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        email,
        firstName: 'Se',
        lastName: 'Elimina',
        password: 'RolesTest-Deletable1!',
        role: 'recepcion',
      });
    const userId = (created.body as UserResponse).id;

    const removed = await request(server)
      .delete(`/users/${userId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(removed.status).toBe(204);

    const stillThere = await request(server)
      .patch(`/users/${userId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ firstName: 'Ya no existe' });
    expect(stillThere.status).toBe(404);
  });

  it('blocks profesional and recepcion from deleting a user', async () => {
    const email = `roles-delete-blocked-${Date.now()}@rls-test.local`;
    const created = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        email,
        firstName: 'No',
        lastName: 'Borrable',
        password: 'RolesTest-NotDeletable1!',
        role: 'recepcion',
      });
    const userId = (created.body as UserResponse).id;

    for (const token of [tokenProfesional, tokenRecepcion]) {
      const blocked = await request(server)
        .delete(`/users/${userId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(blocked.status).toBe(403);
    }
  });

  it('blocks an admin from deleting their own account', async () => {
    const res = await request(server)
      .delete(`/users/${decodeSub(tokenAdmin)}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(400);
  });

  it('blocks deleting a user with an appointment tied to them', async () => {
    const email = `roles-has-history-${Date.now()}@rls-test.local`;
    const created = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        email,
        firstName: 'Con',
        lastName: 'Historial',
        password: 'RolesTest-HasHistory1!',
        role: 'profesional',
      });
    const userId = (created.body as UserResponse).id;

    const appointment = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        scheduledAt: '2027-08-20T09:00:00.000Z',
        durationMinutes: 30,
        practitionerId: userId,
      });
    expect(appointment.status).toBe(201);

    const blocked = await request(server)
      .delete(`/users/${userId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(blocked.status).toBe(409);
  });

  it("never lets an admin delete another tenant's user", async () => {
    const loginB = await request(server)
      .post('/auth/login')
      .send({ identifier: tenantB.userEmail, password: tenantB.userPassword });
    const tokenB = (loginB.body as LoginResponse).accessToken;

    const res = await request(server)
      .delete(`/users/${decodeSub(tokenAdmin)}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
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
