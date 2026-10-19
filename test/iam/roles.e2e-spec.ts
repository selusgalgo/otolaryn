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
  practitionerName?: string | null;
}

interface PatientResponse {
  id: string;
}

interface PaginatedAppointments {
  data: AppointmentResponse[];
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

  it("lets admin edit a user's email, and rejects it when it collides with another account", async () => {
    const emailA = `roles-email-edit-a-${Date.now()}@rls-test.local`;
    const emailB = `roles-email-edit-b-${Date.now()}@rls-test.local`;
    const createdA = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        email: emailA,
        firstName: 'Cambia',
        lastName: 'Email',
        password: 'RolesTest-EmailEdit1!',
        role: 'recepcion',
      });
    expect(createdA.status).toBe(201);
    const userId = (createdA.body as UserResponse).id;

    const createdB = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        email: emailB,
        firstName: 'Ya',
        lastName: 'Existe',
        password: 'RolesTest-EmailEdit2!',
        role: 'recepcion',
      });
    expect(createdB.status).toBe(201);

    const newEmail = `roles-email-edit-nuevo-${Date.now()}@rls-test.local`;
    const updated = await request(server)
      .patch(`/users/${userId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ email: newEmail });
    expect(updated.status).toBe(200);
    expect((updated.body as UserResponse).email).toBe(newEmail);

    const conflict = await request(server)
      .patch(`/users/${userId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ email: emailB });
    expect(conflict.status).toBe(409);
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

  it('deactivates a profesional: login blocked, drops out of the bookable picker, keeps their history', async () => {
    const email = `roles-deactivate-${Date.now()}@rls-test.local`;
    const password = 'RolesTest-Deactivate1!';
    const created = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        email,
        firstName: 'Se',
        lastName: 'Desactiva',
        password,
        role: 'profesional',
      });
    const userId = (created.body as UserResponse).id;

    // Real history, same shape as the "blocks deleting a user with an
    // appointment tied to them" case above — deactivation must survive
    // this instead of being blocked by it.
    const appointment = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        scheduledAt: '2027-08-21T09:00:00.000Z',
        durationMinutes: 30,
        practitionerId: userId,
      });
    expect(appointment.status).toBe(201);

    const loginBefore = await request(server)
      .post('/auth/login')
      .send({ identifier: email, password });
    expect(loginBefore.status).toBe(200);
    const tokenIssuedBeforeDeactivation = (loginBefore.body as LoginResponse)
      .accessToken;

    // Same reasoning as the appointment above, for Historia clínica: a
    // consulta this profesional actually wrote, created while they're
    // still active so authorUserId is genuinely theirs.
    const clinicalEntry = await request(server)
      .post(`/patients/${tenantA.patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${tokenIssuedBeforeDeactivation}`)
      .send({ chiefComplaint: 'Revisión antes de desactivar' });
    expect(clinicalEntry.status).toBe(201);

    const deactivated = await request(server)
      .patch(`/users/${userId}/active`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ active: false });
    expect(deactivated.status).toBe(200);
    expect((deactivated.body as UserResponse).active).toBe(false);

    // Blocks a brand new login attempt...
    const loginAfter = await request(server)
      .post('/auth/login')
      .send({ identifier: email, password });
    expect(loginAfter.status).toBe(401);

    // ...and also kills a token issued *before* the deactivation — the
    // whole point of JwtStrategy's own active check, not just AuthService's.
    const stillLoggedIn = await request(server)
      .get('/account')
      .set('Authorization', `Bearer ${tokenIssuedBeforeDeactivation}`);
    expect(stillLoggedIn.status).toBe(401);

    // Drops out of the bookable picker...
    const bookable = await request(server)
      .get('/users?bookable=true')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect((bookable.body as UserResponse[]).map((u) => u.id)).not.toContain(
      userId,
    );

    // ...but the appointment created earlier still resolves them fine, and
    // a plain listing (not bookable-only) still shows the account to admin.
    const stillOnAppointment = await request(server)
      .get(`/appointments/${(appointment.body as AppointmentResponse).id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(stillOnAppointment.status).toBe(200);
    expect(
      (stillOnAppointment.body as AppointmentResponse).practitionerId,
    ).toBe(userId);

    // ...and the agenda list (where the name actually gets shown, unlike
    // the single-appointment fetch above) still shows their real name —
    // not blank, and not whichever other profesional happens to be
    // looking, which is what resolving it from the bookable-only picker
    // list used to produce once someone was deactivated.
    const agendaListing = await request(server)
      .get('/appointments?from=2027-08-21&to=2027-08-22')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    const listedAppointment = (
      agendaListing.body as { data: AppointmentResponse[] }
    ).data.find(
      (a) => a.id === (appointment.body as AppointmentResponse).id,
    );
    expect(listedAppointment?.practitionerName).toBe('Se Desactiva');

    // Same for Historia clínica: the consulta they wrote still shows their
    // real name in the list, not blank and not whichever other
    // admin/profesional happens to be looking at the ficha.
    const clinicalEntriesListing = await request(server)
      .get(`/patients/${tenantA.patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    const listedEntry = (
      clinicalEntriesListing.body as {
        data: { id: string; authorName?: string | null }[];
      }
    ).data.find(
      (e) => e.id === (clinicalEntry.body as { id: string }).id,
    );
    expect(listedEntry?.authorName).toBe('Se Desactiva');
    const plainListing = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect((plainListing.body as UserResponse[]).map((u) => u.id)).toContain(
      userId,
    );

    // Reactivating restores login.
    const reactivated = await request(server)
      .patch(`/users/${userId}/active`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ active: true });
    expect(reactivated.status).toBe(200);
    expect((reactivated.body as UserResponse).active).toBe(true);

    const loginAfterReactivate = await request(server)
      .post('/auth/login')
      .send({ identifier: email, password });
    expect(loginAfterReactivate.status).toBe(200);
  });

  it('blocks profesional and recepcion from deactivating a user', async () => {
    const email = `roles-deactivate-blocked-${Date.now()}@rls-test.local`;
    const created = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        email,
        firstName: 'No',
        lastName: 'Desactivable',
        password: 'RolesTest-NotDeactivatable1!',
        role: 'recepcion',
      });
    const userId = (created.body as UserResponse).id;

    for (const token of [tokenProfesional, tokenRecepcion]) {
      const blocked = await request(server)
        .patch(`/users/${userId}/active`)
        .set('Authorization', `Bearer ${token}`)
        .send({ active: false });
      expect(blocked.status).toBe(403);
    }
  });

  // The "last active admin" guard (same shape as remove()'s own, see its
  // comment) is only reachable today if a caller other than that admin
  // themselves invokes this — and since the route is admin-only and
  // tenant-scoped, the lone admin of a tenant is always the one hitting
  // the self-check above first. Not independently tested here for the
  // same reason remove()'s equivalent branch isn't either.
  it('blocks an admin from deactivating their own account', async () => {
    const res = await request(server)
      .patch(`/users/${decodeSub(tokenAdmin)}/active`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ active: false });
    expect(res.status).toBe(400);
  });

  it('lets a profesional see any patient in the tenant, not only patients they already have an appointment or entry with', async () => {
    // tenantA.patientId has no appointment/clinical entry with
    // tokenProfesional at this point — used to 404 here (see git history)
    // until the clinic asked for every doctor to be able to look up any
    // patient, e.g. to cover a colleague or check a chart before a first
    // visit. GET /appointments staying scoped to "mine" is the
    // complementary behaviour that's explicitly unchanged — see
    // AppointmentsService.findAll's forced practitionerId filter.
    const res = await request(server)
      .get(`/patients/${tenantA.patientId}`)
      .set('Authorization', `Bearer ${tokenProfesional}`);
    expect(res.status).toBe(200);
    expect((res.body as PatientResponse).id).toBe(tenantA.patientId);

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
  });

  // Bulk data operations on the whole patient list (import/export/dar de
  // baja) stay admin-only (export/import also open to recepcion) — being
  // able to see every patient doesn't mean a profesional can mass-edit or
  // discharge them. Guards run before multer's FileInterceptor, so these
  // import routes 403 before ever looking at the (missing) request body.
  it('blocks profesional from every patients bulk-data route (import/export/dar de baja)', async () => {
    const exportRes = await request(server)
      .get('/patients/export?format=csv')
      .set('Authorization', `Bearer ${tokenProfesional}`);
    expect(exportRes.status).toBe(403);

    const importPreview = await request(server)
      .post('/patients/import/preview')
      .set('Authorization', `Bearer ${tokenProfesional}`);
    expect(importPreview.status).toBe(403);

    const updatePreview = await request(server)
      .post('/patients/import-update/preview')
      .set('Authorization', `Bearer ${tokenProfesional}`);
    expect(updatePreview.status).toBe(403);

    const clinicalImportPreview = await request(server)
      .post('/clinical-entries/import/preview')
      .set('Authorization', `Bearer ${tokenProfesional}`);
    expect(clinicalImportPreview.status).toBe(403);

    const bulkDelete = await request(server)
      .post('/patients/bulk-delete')
      .set('Authorization', `Bearer ${tokenProfesional}`)
      .send({ ids: [tenantA.patientId] });
    expect(bulkDelete.status).toBe(403);

    const singleDelete = await request(server)
      .delete(`/patients/${tenantA.patientId}`)
      .set('Authorization', `Bearer ${tokenProfesional}`);
    expect(singleDelete.status).toBe(403);
  });

  it('lets recepcion export/import patients but not dar de baja or import consultas', async () => {
    const exportRes = await request(server)
      .get('/patients/export?format=csv')
      .set('Authorization', `Bearer ${tokenRecepcion}`);
    expect(exportRes.status).toBe(200);

    const importPreview = await request(server)
      .post('/patients/import/preview')
      .set('Authorization', `Bearer ${tokenRecepcion}`);
    // 400 (no file attached), not 403 — confirms the role check let it
    // through to the handler.
    expect(importPreview.status).toBe(400);

    const clinicalImportPreview = await request(server)
      .post('/clinical-entries/import/preview')
      .set('Authorization', `Bearer ${tokenRecepcion}`);
    expect(clinicalImportPreview.status).toBe(403);

    const bulkDelete = await request(server)
      .post('/patients/bulk-delete')
      .set('Authorization', `Bearer ${tokenRecepcion}`)
      .send({ ids: [tenantA.patientId] });
    expect(bulkDelete.status).toBe(403);
  });

  // agendaAccess: an admin-controlled, per-profesional toggle — see
  // AgendaAccessGuard. A dedicated secondary user here, never the shared
  // tokenProfesional, so toggling it off doesn't disturb every other test
  // in this file that relies on that one always being able to see the
  // Agenda.
  it('lets admin take Agenda access away from one profesional, enforced immediately on their already-issued token, and restore it', async () => {
    const email = `roles-agenda-toggle-${Date.now()}@rls-test.local`;
    const password = 'RolesTest-AgendaToggle1!';
    const created = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        email,
        firstName: 'Con',
        lastName: 'Agenda',
        password,
        role: 'profesional',
      });
    expect(created.status).toBe(201);
    // True by default — nobody loses access until an admin deliberately
    // flips it.
    expect((created.body as UserResponse).agendaAccess).toBe(true);
    const userId = (created.body as UserResponse).id;

    const login = await request(server)
      .post('/auth/login')
      .send({ identifier: email, password });
    const token = (login.body as LoginResponse).accessToken;

    const before = await request(server)
      .get('/appointments')
      .set('Authorization', `Bearer ${token}`);
    expect(before.status).toBe(200);

    const toggledOff = await request(server)
      .patch(`/users/${userId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ agendaAccess: false });
    expect(toggledOff.status).toBe(200);
    expect((toggledOff.body as UserResponse).agendaAccess).toBe(false);

    // Same token as `before`, no new login — the block has to be live
    // against the DB (JwtStrategy.validate), not baked into the JWT.
    const listBlocked = await request(server)
      .get('/appointments')
      .set('Authorization', `Bearer ${token}`);
    expect(listBlocked.status).toBe(403);

    const createBlocked = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ scheduledAt: '2027-09-10T09:00:00.000Z', durationMinutes: 30 });
    expect(createBlocked.status).toBe(403);

    // Dashboard's "Hoy" view embeds a full appointments calendar too —
    // losing the Agenda module has to mean losing this as well, not just
    // the /appointments route itself.
    const today = await request(server)
      .get('/dashboard/today?date=2027-09-10')
      .set('Authorization', `Bearer ${token}`);
    expect(today.status).toBe(200);
    expect((today.body as { appointments: unknown }).appointments).toBeNull();

    const toggledOn = await request(server)
      .patch(`/users/${userId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ agendaAccess: true });
    expect(toggledOn.status).toBe(200);
    expect((toggledOn.body as UserResponse).agendaAccess).toBe(true);

    const listRestored = await request(server)
      .get('/appointments')
      .set('Authorization', `Bearer ${token}`);
    expect(listRestored.status).toBe(200);
  });

  it('never applies agendaAccess=false to admin or recepcion — always forced back to true', async () => {
    for (const token of [tokenAdmin, tokenRecepcion]) {
      const ownId = decodeSub(token);

      // No `role` in the body — UsersService.update() forces agendaAccess
      // back to true for whatever the user's role already is (not just
      // one it's being changed to), so this alone is enough to prove the
      // flag never sticks outside role 'profesional'.
      const res = await request(server)
        .patch(`/users/${ownId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ agendaAccess: false });
      expect(res.status).toBe(200);
      expect((res.body as UserResponse).agendaAccess).toBe(true);

      const stillWorks = await request(server)
        .get('/appointments')
        .set('Authorization', `Bearer ${token}`);
      expect(stillWorks.status).toBe(200);
    }
  });

  it("only lists a profesional's own appointments, never a colleague's", async () => {
    const own = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenProfesional}`)
      .send({ scheduledAt: '2027-08-20T09:00:00.000Z', durationMinutes: 30 });
    expect(own.status).toBe(201);
    const ownId = (own.body as AppointmentResponse).id;

    // Assigned to the admin's own user id — any iam.users id works as a
    // practitioner FK-wise, and the point here is just that it's *not*
    // tokenProfesional's own id.
    const colleague = await request(server)
      .post(`/patients/${tenantA.patientId}/appointments`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        scheduledAt: '2027-08-20T10:00:00.000Z',
        durationMinutes: 30,
        practitionerId: decodeSub(tokenAdmin),
      });
    expect(colleague.status).toBe(201);
    const colleagueId = (colleague.body as AppointmentResponse).id;

    const list = await request(server)
      .get('/appointments?pageSize=100')
      .set('Authorization', `Bearer ${tokenProfesional}`);
    expect(list.status).toBe(200);
    const ids = (list.body as PaginatedAppointments).data.map((a) => a.id);
    expect(ids).toContain(ownId);
    expect(ids).not.toContain(colleagueId);

    // A profesional can't widen the list by asking for someone else's
    // practitionerId either — see AppointmentsService.findAll, the filter
    // is forced, not just defaulted.
    const triedToWiden = await request(server)
      .get(`/appointments?practitionerId=${decodeSub(tokenAdmin)}&pageSize=100`)
      .set('Authorization', `Bearer ${tokenProfesional}`);
    expect(triedToWiden.status).toBe(200);
    const widenedIds = (triedToWiden.body as PaginatedAppointments).data.map(
      (a) => a.id,
    );
    expect(widenedIds).not.toContain(colleagueId);
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
