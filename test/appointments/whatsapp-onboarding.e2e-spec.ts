import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import type { Pool } from 'pg';
import request from 'supertest';
import { createTestApp } from '../rls/support/app';
import { createTestTenants, destroyTestTenants, type TestTenant } from '../rls/support/fixtures';
import { appPool, ownerPool } from '../rls/support/pools';
import { createHash } from 'node:crypto';
import { WhatsappCredentialCrypto } from '../../src/whatsapp-booking/whatsapp-credential-crypto';
import { JwtService } from '@nestjs/jwt';

const routerToken = `test_${'z'.repeat(48)}`;

describe('WhatsApp onboarding isolation', () => {
  let app: INestApplication;
  let server: Server;
  let owner: Pool;
  let tenants: [TestTenant, TestTenant];
  let tokens: string[];
  beforeAll(async () => {
    owner = ownerPool();
    tenants = await createTestTenants(owner);
    Object.assign(process.env, {
      WHATSAPP_ONBOARDING_DEMO_TENANT_ID: tenants[0].id,
      WHATSAPP_META_APP_ID: '123', WHATSAPP_META_CONFIG_ID: '456',
      WHATSAPP_META_APP_SECRET: 'test-secret', WHATSAPP_CREDENTIAL_KEY: 'ab'.repeat(32),
      WHATSAPP_ONBOARDING_DEMO_WABA_ID: '555', WHATSAPP_ONBOARDING_DEMO_PHONE_ID: '777',
      WHATSAPP_ROUTER_DEMO_TENANT_ID: tenants[0].id,
      WHATSAPP_ROUTER_DEMO_BINDINGS: JSON.stringify({ '+34699990001': '+34600000994' }),
      WHATSAPP_ROUTER_TOKEN_SHA256: createHash('sha256').update(routerToken).digest('hex'),
    });
    app = await createTestApp();
    server = app.getHttpServer() as Server;
    tokens = [];
    for (const tenant of tenants) {
      const login = await request(server).post('/auth/login').send({ identifier: tenant.userEmail, password: tenant.userPassword }).expect(200);
      tokens.push((login.body as { accessToken: string }).accessToken);
    }
  }, 30000);
  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
    if (tenants) await destroyTestTenants(owner, tenants);
    await owner?.end();
    for (const key of ['WHATSAPP_ONBOARDING_DEMO_TENANT_ID', 'WHATSAPP_META_APP_ID', 'WHATSAPP_META_CONFIG_ID', 'WHATSAPP_META_APP_SECRET', 'WHATSAPP_CREDENTIAL_KEY', 'WHATSAPP_ONBOARDING_DEMO_WABA_ID', 'WHATSAPP_ONBOARDING_DEMO_PHONE_ID', 'WHATSAPP_ROUTER_DEMO_TENANT_ID', 'WHATSAPP_ROUTER_DEMO_BINDINGS', 'WHATSAPP_ROUTER_TOKEN_SHA256', 'WHATSAPP_ROUTER_ACTIVATION_ENABLED']) delete process.env[key];
  });

  it('permite un solo registro autenticado y bloquea a otra clínica', async () => {
    const endpoint = '/settings/whatsapp-connection';
    await request(server).post(`${endpoint}/begin`).expect(401);
    await request(server).post(`${endpoint}/begin`).set('Authorization', `Bearer ${tokens[1]}`).expect(403);
    const begin = await request(server).post(`${endpoint}/begin`).set('Authorization', `Bearer ${tokens[0]}`).expect(201);
    expect(begin.body.appId).toBe('123');
    const input = { state: begin.body.state, code: 'fictitious-code', wabaId: '555', phoneNumberId: '777' };
    const meta = jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'fake-token' }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: '777' }] }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ whatsapp_business_api_data: { id: '123' } }] }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: 'wamid-test' }] }), { status: 200 }));
    try {
      await request(server).post(`${endpoint}/complete`).set('Authorization', `Bearer ${tokens[1]}`).send(input).expect(403);
      await request(server).post(`${endpoint}/complete`).set('Authorization', `Bearer ${tokens[0]}`).send({ ...input, wabaId: '999' }).expect(403);
      await request(server).post(`${endpoint}/complete`).set('Authorization', `Bearer ${tokens[0]}`).send(input).expect(201, { status: 'pending' });
      await request(server).post(`${endpoint}/complete`).set('Authorization', `Bearer ${tokens[0]}`).send(input).expect(400);
      expect(meta).toHaveBeenCalledTimes(2);
      await request(server).get(endpoint).set('Authorization', `Bearer ${tokens[0]}`).expect(200, { status: 'pending' });
      await request(server).post(`${endpoint}/activate`).set('Authorization', `Bearer ${tokens[0]}`).expect(503);
      process.env.WHATSAPP_ROUTER_ACTIVATION_ENABLED = 'true';
      await request(server).post(`${endpoint}/activate`).set('Authorization', `Bearer ${tokens[0]}`).expect(400);
      await request(server).get(endpoint).set('Authorization', `Bearer ${tokens[0]}`).expect(200, { status: 'pending' });
      await request(server).post(`${endpoint}/activate`).set('Authorization', `Bearer ${tokens[0]}`).expect(201, { status: 'ready' });
      expect(meta).toHaveBeenCalledTimes(6);
      const client = await owner.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenants[0].id]);
        const saved = await client.query('SELECT encrypted_access_token, status FROM public.whatsapp_tenant_connections');
        expect(saved.rows).toHaveLength(1);
        expect(saved.rows[0].status).toBe('ready');
        expect(saved.rows[0].encrypted_access_token).not.toContain('fake-token');
        await client.query('ROLLBACK');
      } finally { client.release(); }
      const restricted = appPool();
      try {
        const resolved = await restricted.query('SELECT iam.whatsapp_connection_tenant($1) AS id', ['777']);
        expect(resolved.rows[0].id).toBe(tenants[0].id);
        const unknown = await restricted.query('SELECT iam.whatsapp_connection_tenant($1) AS id', ['999']);
        expect(unknown.rows[0].id).toBeNull();
        await expect(restricted.query('SELECT * FROM iam.whatsapp_connection_routes')).rejects.toMatchObject({ code: '42501' });
      } finally { await restricted.end(); }
      const foreign = await owner.connect();
      try {
        await foreign.query('BEGIN');
        await foreign.query("SELECT set_config('app.tenant_id',$1,true)", [tenants[1].id]);
        await foreign.query(`INSERT INTO public.whatsapp_tenant_connections (tenant_id,waba_id,phone_number_id,encrypted_access_token,status) VALUES ($1,'556','888',$2,'ready')`, [tenants[1].id, new WhatsappCredentialCrypto('ab'.repeat(32)).encrypt(tenants[1].id, 'other-token')]);
        await foreign.query('COMMIT');
      } finally { foreign.release(); }
      const routed = '/integrations/whatsapp-tenant-router/messages';
      const message = { phoneNumberId: '777', phone: '+34699990001', messageId: 'router-msg-1', text: 'HOLA' };
      await request(server).post(routed).send(message).expect(401);
      await request(server).post(routed).set('Authorization', `Bearer ${routerToken}`).send({ ...message, phone: '+34699990002' }).expect(403);
      await request(server).post(routed).set('Authorization', `Bearer ${routerToken}`).send({ ...message, phoneNumberId: '888' }).expect(403);
      await request(server).post(routed).set('Authorization', `Bearer ${routerToken}`).send(message).expect(201, { status: 'sent' });
      await request(server).post(routed).set('Authorization', `Bearer ${routerToken}`).send(message).expect(201, { status: 'duplicate' });
      expect(meta).toHaveBeenCalledTimes(7);
      const [, metaRequest] = meta.mock.calls[6];
      expect((metaRequest as RequestInit).headers).toMatchObject({ Authorization: 'Bearer fake-token' });
      meta.mockRejectedValueOnce(new Error('connection lost'));
      const uncertain = { ...message, messageId: 'router-msg-2' };
      await request(server).post(routed).set('Authorization', `Bearer ${routerToken}`).send(uncertain).expect(201, { status: 'uncertain' });
      await request(server).post(routed).set('Authorization', `Bearer ${routerToken}`).send(uncertain).expect(201, { status: 'duplicate' });
      expect(meta).toHaveBeenCalledTimes(8);
    } finally { meta.mockRestore(); }
  });

  it('impide iniciar sesión o usar un JWT de otra clínica en el backend demo', async () => {
    process.env.MEDERI_DEMO_ONLY_TENANT_ID = tenants[0].id;
    const demoApp = await createTestApp();
    try {
      const demoServer = demoApp.getHttpServer() as Server;
      await request(demoServer).post('/auth/login').send({ identifier: tenants[0].userEmail, password: tenants[0].userPassword }).expect(200);
      await request(demoServer).post('/auth/login').send({ identifier: tenants[1].userEmail, password: tenants[1].userPassword }).expect(401);
      const user = await owner.query<{ id: string }>('SELECT id FROM iam.users WHERE email=$1', [tenants[1].userEmail]);
      const foreignToken = await demoApp.get(JwtService).signAsync({ sub: user.rows[0].id, tenant_id: tenants[1].id, role: 'admin' });
      await request(demoServer).get('/settings/whatsapp-booking').set('Authorization', `Bearer ${foreignToken}`).expect(401);
    } finally {
      await demoApp.close();
      delete process.env.MEDERI_DEMO_ONLY_TENANT_ID;
    }
  });
});
