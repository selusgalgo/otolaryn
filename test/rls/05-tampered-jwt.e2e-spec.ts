import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestApp } from './support/app';
import { ownerPool } from './support/pools';
import {
  createTestTenants,
  destroyTestTenants,
  TestTenant,
} from './support/fixtures';

interface LoginResponse {
  accessToken: string;
}

interface JwtPayload {
  sub: string;
  tenant_id: string;
  role: string;
  exp?: number;
}

// A token whose signature doesn't verify must be rejected before it ever
// reaches the database layer — this is what stops "just edit the tenant_id
// claim client-side" as an attack.
describe('RLS: tampered JWT is rejected before hitting the database', () => {
  let app: INestApplication;
  let server: Server;
  let owner: Pool;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let validToken: string;

  beforeAll(async () => {
    owner = ownerPool();
    [tenantA, tenantB] = await createTestTenants(owner);

    app = await createTestApp();
    server = app.getHttpServer() as Server;
    const login = await request(server)
      .post('/auth/login')
      .send({ identifier: tenantA.userEmail, password: tenantA.userPassword });
    validToken = (login.body as LoginResponse).accessToken;
    expect(validToken).toBeDefined();
  }, 30000);

  afterAll(async () => {
    await app.close();
    await destroyTestTenants(owner, [tenantA, tenantB]);
    await owner.end();
  });

  it('accepts the untouched, correctly-signed token as a control case', async () => {
    const res = await request(server)
      .get('/patients')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
  });

  it('rejects a token with a mutated signature', async () => {
    const tampered = `${validToken.slice(0, -1)}${validToken.endsWith('a') ? 'b' : 'a'}`;
    const res = await request(server)
      .get('/patients')
      .set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });

  it('rejects a token whose payload was swapped to claim tenant B', async () => {
    const [headerB64, payloadB64, signatureB64] = validToken.split('.');
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as JwtPayload;
    payload.tenant_id = tenantB.id;
    const forgedPayloadB64 = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    // Signature is left as-is (attacker doesn't have the secret), so this
    // must fail signature verification.
    const forged = `${headerB64}.${forgedPayloadB64}.${signatureB64}`;

    const res = await request(server)
      .get('/patients')
      .set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with a different secret entirely', async () => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload: JwtPayload = {
      sub: 'attacker',
      tenant_id: tenantB.id,
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const encode = (obj: object) =>
      Buffer.from(JSON.stringify(obj)).toString('base64url');
    const signingInput = `${encode(header)}.${encode(payload)}`;
    const signature = createHmac('sha256', 'not-the-real-secret')
      .update(signingInput)
      .digest('base64url');
    const forged = `${signingInput}.${signature}`;

    const res = await request(server)
      .get('/patients')
      .set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('rejects requests with no token at all', async () => {
    const res = await request(server).get('/patients');
    expect(res.status).toBe(401);
  });
});
