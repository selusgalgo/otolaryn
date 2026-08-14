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

interface ProfileResponse {
  firstName: string;
  lastName: string;
  username: string | null;
  email: string;
  role: string;
}

const SECOND_USER_PASSWORD = 'AccountTest-Second1!';
const SUPERADMIN_PASSWORD = 'AccountTest-Superadmin1!';

describe('Account (mi cuenta)', () => {
  let app: INestApplication;
  let server: Server;
  let owner: Pool;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let tokenA: string;
  let secondEmail: string;
  let secondToken: string;
  let superadminEmail: string;
  let superadminToken: string;

  beforeAll(async () => {
    owner = ownerPool();
    [tenantA, tenantB] = await createTestTenants(owner);

    const secondHash = await argon2.hash(SECOND_USER_PASSWORD, {
      type: argon2.argon2id,
    });
    secondEmail = `account-second-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, 'profesional', 'Segundo', 'Usuario')`,
      [tenantA.id, secondEmail, secondHash],
    );

    const superadminHash = await argon2.hash(SUPERADMIN_PASSWORD, {
      type: argon2.argon2id,
    });
    superadminEmail = `account-superadmin-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES (NULL, $1, $2, 'superadmin', 'Cuenta', 'Superadmin')`,
      [superadminEmail, superadminHash],
    );

    app = await createTestApp();
    server = app.getHttpServer() as Server;

    const loginA = await request(server)
      .post('/auth/login')
      .send({ identifier: tenantA.userEmail, password: tenantA.userPassword });
    const loginSecond = await request(server)
      .post('/auth/login')
      .send({ identifier: secondEmail, password: SECOND_USER_PASSWORD });
    const loginSuperadmin = await request(server)
      .post('/auth/login')
      .send({ identifier: superadminEmail, password: SUPERADMIN_PASSWORD });

    tokenA = (loginA.body as LoginResponse).accessToken;
    secondToken = (loginSecond.body as LoginResponse).accessToken;
    superadminToken = (loginSuperadmin.body as LoginResponse).accessToken;
    expect(tokenA).toBeDefined();
    expect(secondToken).toBeDefined();
    expect(superadminToken).toBeDefined();
  }, 30000);

  afterAll(async () => {
    await app.close();
    await destroyTestTenants(owner, [tenantA, tenantB]);
    await owner.query(`DELETE FROM iam.users WHERE email = ANY($1)`, [
      [secondEmail, superadminEmail],
    ]);
    await owner.end();
  });

  it('returns the caller own profile, never a password hash', async () => {
    const res = await request(server)
      .get('/account')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const body = res.body as ProfileResponse;
    expect(body.email).toBe(tenantA.userEmail);
    expect(body.username).toBeNull();
    expect(JSON.stringify(body)).not.toContain('passwordHash');
    expect(JSON.stringify(body)).not.toContain('argon2');
  });

  it('lets superadmin reach its own account despite having no tenant', async () => {
    const res = await request(server)
      .get('/account')
      .set('Authorization', `Bearer ${superadminToken}`);

    expect(res.status).toBe(200);
    expect((res.body as ProfileResponse).role).toBe('superadmin');
  });

  it('updates name and sets a username, which then works to log in', async () => {
    const username = `aurora-admin-${Date.now()}`;
    const update = await request(server)
      .patch('/account/profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ firstName: 'Laura Actualizada', lastName: 'Gomez', username });

    expect(update.status).toBe(200);
    const body = update.body as ProfileResponse;
    expect(body.firstName).toBe('Laura Actualizada');
    expect(body.username).toBe(username);

    const loginByUsername = await request(server)
      .post('/auth/login')
      .send({ identifier: username, password: tenantA.userPassword });
    expect(loginByUsername.status).toBe(200);
    expect((loginByUsername.body as LoginResponse).accessToken).toBeDefined();

    // Email keeps working too — username is additive, not a replacement.
    const loginByEmail = await request(server)
      .post('/auth/login')
      .send({ identifier: tenantA.userEmail, password: tenantA.userPassword });
    expect(loginByEmail.status).toBe(200);
  });

  it('rejects a username already taken by someone else', async () => {
    const username = `taken-${Date.now()}`;
    const first = await request(server)
      .patch('/account/profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ firstName: 'Laura', lastName: 'Gomez', username });
    expect(first.status).toBe(200);

    const conflict = await request(server)
      .patch('/account/profile')
      .set('Authorization', `Bearer ${secondToken}`)
      .send({ firstName: 'Segundo', lastName: 'Usuario', username });
    expect(conflict.status).toBe(409);
  });

  it('changes the password after verifying the current one, and rejects a wrong current password', async () => {
    const wrongCurrent = await request(server)
      .patch('/account/password')
      .set('Authorization', `Bearer ${secondToken}`)
      .send({
        currentPassword: 'not-the-real-password',
        newPassword: 'AccountTest-New1!',
      });
    expect(wrongCurrent.status).toBe(401);

    const changed = await request(server)
      .patch('/account/password')
      .set('Authorization', `Bearer ${secondToken}`)
      .send({
        currentPassword: SECOND_USER_PASSWORD,
        newPassword: 'AccountTest-New1!',
      });
    expect(changed.status).toBe(204);

    const loginOldPassword = await request(server)
      .post('/auth/login')
      .send({ identifier: secondEmail, password: SECOND_USER_PASSWORD });
    expect(loginOldPassword.status).toBe(401);

    const loginNewPassword = await request(server)
      .post('/auth/login')
      .send({ identifier: secondEmail, password: 'AccountTest-New1!' });
    expect(loginNewPassword.status).toBe(200);
  });
});
