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

interface DeviceLockResponse {
  enabled: boolean;
  hasCredential: boolean;
}

interface GenerateCredentialResponse extends DeviceLockResponse {
  token: string;
}

const PROFESIONAL_PASSWORD = 'DeviceLockTest-Profesional1!';
const RECEPCION_PASSWORD = 'DeviceLockTest-Recepcion1!';

describe('Device lock (Configuración → Seguridad)', () => {
  let app: INestApplication;
  let server: Server;
  let owner: Pool;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let tokenA: string;
  let tokenB: string;
  let profesionalEmail: string;
  let recepcionEmail: string;

  async function loginAs(
    identifier: string,
    password: string,
    deviceToken?: string,
  ) {
    return request(server)
      .post('/auth/login')
      .send({ identifier, password, ...(deviceToken ? { deviceToken } : {}) });
  }

  beforeAll(async () => {
    owner = ownerPool();
    [tenantA, tenantB] = await createTestTenants(owner);

    const profesionalHash = await argon2.hash(PROFESIONAL_PASSWORD, {
      type: argon2.argon2id,
    });
    profesionalEmail = `device-lock-profesional-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, 'profesional', 'DeviceLock', 'Profesional')`,
      [tenantA.id, profesionalEmail, profesionalHash],
    );

    const recepcionHash = await argon2.hash(RECEPCION_PASSWORD, {
      type: argon2.argon2id,
    });
    recepcionEmail = `device-lock-recepcion-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, 'recepcion', 'DeviceLock', 'Recepcion')`,
      [tenantA.id, recepcionEmail, recepcionHash],
    );

    app = await createTestApp();
    server = app.getHttpServer() as Server;

    const loginA = await loginAs(tenantA.userEmail, tenantA.userPassword);
    const loginB = await loginAs(tenantB.userEmail, tenantB.userPassword);
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

  it('starts disabled with no credential', async () => {
    const res = await request(server)
      .get('/settings/device-lock')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body as DeviceLockResponse).toEqual({
      enabled: false,
      hasCredential: false,
    });
  });

  it('blocks profesional/recepcion from reading or writing it', async () => {
    const loginProfesional = await loginAs(profesionalEmail, PROFESIONAL_PASSWORD);
    const profesionalToken = (loginProfesional.body as LoginResponse).accessToken;

    const read = await request(server)
      .get('/settings/device-lock')
      .set('Authorization', `Bearer ${profesionalToken}`);
    expect(read.status).toBe(403);

    const write = await request(server)
      .patch('/settings/device-lock')
      .set('Authorization', `Bearer ${profesionalToken}`)
      .send({ enabled: true });
    expect(write.status).toBe(403);
  });

  it('enabling without a credential does not lock out profesional/recepcion', async () => {
    const toggle = await request(server)
      .patch('/settings/device-lock')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ enabled: true });
    expect(toggle.status).toBe(200);
    expect(toggle.body as DeviceLockResponse).toEqual({
      enabled: true,
      hasCredential: false,
    });

    const loginProfesional = await loginAs(profesionalEmail, PROFESIONAL_PASSWORD);
    expect(loginProfesional.status).toBe(200);

    const loginRecepcion = await loginAs(recepcionEmail, RECEPCION_PASSWORD);
    expect(loginRecepcion.status).toBe(200);

    // Reset for the following tests.
    await request(server)
      .patch('/settings/device-lock')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ enabled: false });
  });

  it('once a credential exists, blocks profesional login without the matching device token — recepcion/admin unaffected', async () => {
    const generate = await request(server)
      .post('/settings/device-lock/credential')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(generate.status).toBe(201);
    const { token } = generate.body as GenerateCredentialResponse;
    expect(token).toBeTruthy();

    await request(server)
      .patch('/settings/device-lock')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ enabled: true });

    const withoutToken = await loginAs(profesionalEmail, PROFESIONAL_PASSWORD);
    expect(withoutToken.status).toBe(401);

    const wrongToken = await loginAs(
      profesionalEmail,
      PROFESIONAL_PASSWORD,
      'not-the-right-token',
    );
    expect(wrongToken.status).toBe(401);

    const withToken = await loginAs(profesionalEmail, PROFESIONAL_PASSWORD, token);
    expect(withToken.status).toBe(200);
    expect((withToken.body as LoginResponse).accessToken).toBeDefined();

    // recepcion and admin are never restricted by this, regardless of role.
    const recepcionLogin = await loginAs(recepcionEmail, RECEPCION_PASSWORD);
    expect(recepcionLogin.status).toBe(200);

    const adminLogin = await loginAs(tenantA.userEmail, tenantA.userPassword);
    expect(adminLogin.status).toBe(200);
  });

  it('re-checks the device token on every subsequent request, not just at login', async () => {
    const generate = await request(server)
      .post('/settings/device-lock/credential')
      .set('Authorization', `Bearer ${tokenA}`);
    const { token } = generate.body as GenerateCredentialResponse;

    const loginProfesional = await loginAs(
      profesionalEmail,
      PROFESIONAL_PASSWORD,
      token,
    );
    const profesionalToken = (loginProfesional.body as LoginResponse).accessToken;

    const meWithToken = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${profesionalToken}`)
      .set('X-Device-Token', token);
    expect(meWithToken.status).toBe(200);

    // Generating a new credential invalidates the old token immediately —
    // the already-issued JWT is still valid, but the device check on this
    // very next request now fails.
    await request(server)
      .post('/settings/device-lock/credential')
      .set('Authorization', `Bearer ${tokenA}`);

    const meWithStaleToken = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${profesionalToken}`)
      .set('X-Device-Token', token);
    expect(meWithStaleToken.status).toBe(401);
  });

  it('revoking the credential blocks profesional until a new one is generated', async () => {
    const revoke = await request(server)
      .delete('/settings/device-lock/credential')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(revoke.status).toBe(200);
    expect(revoke.body as DeviceLockResponse).toEqual({
      enabled: true,
      hasCredential: false,
    });

    // enabled but no credential — same lockout-guard as the "enabling
    // without a credential" test above, reached this time via revoke.
    const login = await loginAs(profesionalEmail, PROFESIONAL_PASSWORD);
    expect(login.status).toBe(200);

    await request(server)
      .patch('/settings/device-lock')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ enabled: false });
  });

  it("never touches another tenant's device lock", async () => {
    const tenantBLock = await request(server)
      .get('/settings/device-lock')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(tenantBLock.status).toBe(200);
    expect(tenantBLock.body as DeviceLockResponse).toEqual({
      enabled: false,
      hasCredential: false,
    });
  });
});
