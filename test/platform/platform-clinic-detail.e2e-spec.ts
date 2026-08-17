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
  username: string | null;
  firstName: string;
  lastName: string;
  role: string;
  [key: string]: unknown;
}

interface PatientResponse {
  id: string;
  firstName: string;
  lastName: string;
}

interface PaginatedPatients {
  data: PatientResponse[];
  total: number;
  page: number;
  pageSize: number;
}

const PROFESIONAL_PASSWORD = 'ClinicDetail-Profesional1!';
const SUPERADMIN_PASSWORD = 'ClinicDetail-Superadmin1!';

describe('Platform — clinic detail (patients read-only, users management)', () => {
  let app: INestApplication;
  let server: Server;
  let owner: Pool;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let tokenAdmin: string;
  let tokenProfesional: string;
  let tokenSuperadmin: string;
  let superadminEmail: string;

  beforeAll(async () => {
    owner = ownerPool();
    [tenantA, tenantB] = await createTestTenants(owner);

    const profesionalHash = await argon2.hash(PROFESIONAL_PASSWORD, {
      type: argon2.argon2id,
    });
    const profesionalEmail = `clinic-detail-profesional-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, 'profesional', 'ClinicDetail', 'Profesional')`,
      [tenantA.id, profesionalEmail, profesionalHash],
    );

    const superadminHash = await argon2.hash(SUPERADMIN_PASSWORD, {
      type: argon2.argon2id,
    });
    superadminEmail = `clinic-detail-superadmin-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES (NULL, $1, $2, 'superadmin', 'ClinicDetail', 'Superadmin')`,
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
    const loginSuperadmin = await request(server)
      .post('/auth/login')
      .send({ identifier: superadminEmail, password: SUPERADMIN_PASSWORD });

    tokenAdmin = (loginAdmin.body as LoginResponse).accessToken;
    tokenProfesional = (loginProfesional.body as LoginResponse).accessToken;
    tokenSuperadmin = (loginSuperadmin.body as LoginResponse).accessToken;
    expect(tokenAdmin).toBeDefined();
    expect(tokenProfesional).toBeDefined();
    expect(tokenSuperadmin).toBeDefined();
  }, 30000);

  afterAll(async () => {
    await app.close();
    await destroyTestTenants(owner, [tenantA, tenantB]);
    await owner.query(`DELETE FROM iam.users WHERE email = $1`, [
      superadminEmail,
    ]);
    await owner.end();
  });

  it("lets superadmin see a clinic's patients, isolated from other clinics", async () => {
    const resA = await request(server)
      .get(`/platform/tenants/${tenantA.id}/patients`)
      .set('Authorization', `Bearer ${tokenSuperadmin}`);
    expect(resA.status).toBe(200);
    const patientIdsA = (resA.body as PaginatedPatients).data.map((p) => p.id);
    expect(patientIdsA).toContain(tenantA.patientId);
    expect(patientIdsA).not.toContain(tenantB.patientId);

    const resB = await request(server)
      .get(`/platform/tenants/${tenantB.id}/patients`)
      .set('Authorization', `Bearer ${tokenSuperadmin}`);
    expect(resB.status).toBe(200);
    const patientIdsB = (resB.body as PaginatedPatients).data.map((p) => p.id);
    expect(patientIdsB).toContain(tenantB.patientId);
    expect(patientIdsB).not.toContain(tenantA.patientId);
  });

  it('blocks admin/profesional from the platform patients/users routes', async () => {
    for (const token of [tokenAdmin, tokenProfesional]) {
      const patients = await request(server)
        .get(`/platform/tenants/${tenantA.id}/patients`)
        .set('Authorization', `Bearer ${token}`);
      expect(patients.status).toBe(403);

      const users = await request(server)
        .get(`/platform/tenants/${tenantA.id}/users`)
        .set('Authorization', `Bearer ${token}`);
      expect(users.status).toBe(403);
    }
  });

  it("lets superadmin see a clinic's users, isolated from other clinics", async () => {
    const resA = await request(server)
      .get(`/platform/tenants/${tenantA.id}/users`)
      .set('Authorization', `Bearer ${tokenSuperadmin}`);
    expect(resA.status).toBe(200);
    const emailsA = (resA.body as UserResponse[]).map((u) => u.email);
    expect(emailsA).toContain(tenantA.userEmail);

    const resB = await request(server)
      .get(`/platform/tenants/${tenantB.id}/users`)
      .set('Authorization', `Bearer ${tokenSuperadmin}`);
    const emailsB = (resB.body as UserResponse[]).map((u) => u.email);
    expect(emailsB).not.toContain(tenantA.userEmail);
  });

  it('lets superadmin create a user in a chosen clinic, who can then log in', async () => {
    const email = `clinic-detail-created-${Date.now()}@rls-test.local`;
    const created = await request(server)
      .post(`/platform/tenants/${tenantA.id}/users`)
      .set('Authorization', `Bearer ${tokenSuperadmin}`)
      .send({
        email,
        firstName: 'Creado',
        lastName: 'PorSuperadmin',
        password: 'ClinicDetail-NewUser1!',
        role: 'recepcion',
      });
    expect(created.status).toBe(201);
    const body = created.body as UserResponse;
    expect(body.email).toBe(email);
    expect(body).not.toHaveProperty('passwordHash');

    const login = await request(server)
      .post('/auth/login')
      .send({ identifier: email, password: 'ClinicDetail-NewUser1!' });
    expect(login.status).toBe(200);
  });

  it("lets superadmin edit a clinic's user (name, username, role)", async () => {
    const list = await request(server)
      .get(`/platform/tenants/${tenantA.id}/users`)
      .set('Authorization', `Bearer ${tokenSuperadmin}`);
    const target = (list.body as UserResponse[]).find(
      (u) => u.email === tenantA.userEmail,
    )!;

    const update = await request(server)
      .patch(`/platform/tenants/${tenantA.id}/users/${target.id}`)
      .set('Authorization', `Bearer ${tokenSuperadmin}`)
      .send({ firstName: 'Editado', username: `edited-${Date.now()}` });
    expect(update.status).toBe(200);
    expect((update.body as UserResponse).firstName).toBe('Editado');
  });

  it("lets superadmin reset a clinic user's password, and the old one stops working", async () => {
    const list = await request(server)
      .get(`/platform/tenants/${tenantA.id}/users`)
      .set('Authorization', `Bearer ${tokenSuperadmin}`);
    const target = (list.body as UserResponse[]).find(
      (u) => u.email === tenantA.userEmail,
    )!;

    const reset = await request(server)
      .patch(`/platform/tenants/${tenantA.id}/users/${target.id}/password`)
      .set('Authorization', `Bearer ${tokenSuperadmin}`)
      .send({ newPassword: 'ClinicDetail-ResetPassword1!' });
    expect(reset.status).toBe(200);

    const oldLogin = await request(server)
      .post('/auth/login')
      .send({ identifier: tenantA.userEmail, password: tenantA.userPassword });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(server).post('/auth/login').send({
      identifier: tenantA.userEmail,
      password: 'ClinicDetail-ResetPassword1!',
    });
    expect(newLogin.status).toBe(200);
  });

  it("refuses to edit a user via the wrong clinic's id (cross-tenant guess)", async () => {
    const listB = await request(server)
      .get(`/platform/tenants/${tenantB.id}/users`)
      .set('Authorization', `Bearer ${tokenSuperadmin}`);
    const someUserInB = (listB.body as UserResponse[])[0];

    // tenantA.id in the URL, but the user id belongs to tenantB — must 404,
    // not silently succeed against the wrong clinic's user.
    const res = await request(server)
      .patch(`/platform/tenants/${tenantA.id}/users/${someUserInB.id}`)
      .set('Authorization', `Bearer ${tokenSuperadmin}`)
      .send({ firstName: 'No deberia aplicar' });
    expect(res.status).toBe(404);
  });
});
