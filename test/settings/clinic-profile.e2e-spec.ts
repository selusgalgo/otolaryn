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

interface ClinicProfileResponse {
  name: string;
  address: string | null;
  phone: string | null;
  logo: string | null;
}

const PROFESIONAL_PASSWORD = 'ClinicProfileTest-Profesional1!';
const SUPERADMIN_PASSWORD = 'ClinicProfileTest-Superadmin1!';

// A 1x1 transparent PNG — just enough bytes for a real multipart file
// upload, not meant to look like anything.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('Clinic profile (Configuración → Perfil de la clínica)', () => {
  let app: INestApplication;
  let server: Server;
  let owner: Pool;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let tokenA: string;
  let tokenB: string;
  let profesionalToken: string;
  let superadminEmail: string;
  let superadminToken: string;

  beforeAll(async () => {
    owner = ownerPool();
    [tenantA, tenantB] = await createTestTenants(owner);

    const profesionalHash = await argon2.hash(PROFESIONAL_PASSWORD, {
      type: argon2.argon2id,
    });
    const profesionalEmail = `clinic-profile-profesional-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, 'profesional', 'Clinic', 'Profesional')`,
      [tenantA.id, profesionalEmail, profesionalHash],
    );

    const superadminHash = await argon2.hash(SUPERADMIN_PASSWORD, {
      type: argon2.argon2id,
    });
    superadminEmail = `clinic-profile-superadmin-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES (NULL, $1, $2, 'superadmin', 'Clinic', 'Superadmin')`,
      [superadminEmail, superadminHash],
    );

    app = await createTestApp();
    server = app.getHttpServer() as Server;

    const loginA = await request(server)
      .post('/auth/login')
      .send({ identifier: tenantA.userEmail, password: tenantA.userPassword });
    const loginB = await request(server)
      .post('/auth/login')
      .send({ identifier: tenantB.userEmail, password: tenantB.userPassword });
    const loginProfesional = await request(server)
      .post('/auth/login')
      .send({ identifier: profesionalEmail, password: PROFESIONAL_PASSWORD });
    const loginSuperadmin = await request(server)
      .post('/auth/login')
      .send({ identifier: superadminEmail, password: SUPERADMIN_PASSWORD });

    tokenA = (loginA.body as LoginResponse).accessToken;
    tokenB = (loginB.body as LoginResponse).accessToken;
    profesionalToken = (loginProfesional.body as LoginResponse).accessToken;
    superadminToken = (loginSuperadmin.body as LoginResponse).accessToken;
    expect(tokenA).toBeDefined();
    expect(tokenB).toBeDefined();
    expect(profesionalToken).toBeDefined();
    expect(superadminToken).toBeDefined();
  }, 30000);

  afterAll(async () => {
    await app.close();
    await destroyTestTenants(owner, [tenantA, tenantB]);
    await owner.query(`DELETE FROM iam.users WHERE email = $1`, [
      superadminEmail,
    ]);
    await owner.end();
  });

  it('starts with just the tenant name, no address/phone/logo', async () => {
    const res = await request(server)
      .get('/settings/clinic-profile')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const body = res.body as ClinicProfileResponse;
    expect(body.name).toBe(tenantA.name);
    expect(body.address).toBeNull();
    expect(body.phone).toBeNull();
    expect(body.logo).toBeNull();
  });

  it('lets profesional read the profile but not write it', async () => {
    const read = await request(server)
      .get('/settings/clinic-profile')
      .set('Authorization', `Bearer ${profesionalToken}`);
    expect(read.status).toBe(200);

    const write = await request(server)
      .patch('/settings/clinic-profile')
      .set('Authorization', `Bearer ${profesionalToken}`)
      .field('name', 'No debería aplicar');
    expect(write.status).toBe(403);
  });

  it('rejects an empty name', async () => {
    const res = await request(server)
      .patch('/settings/clinic-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('name', '   ');
    expect(res.status).toBe(400);
  });

  it("lets admin update name/address/phone on their own clinic, without touching another tenant's", async () => {
    const res = await request(server)
      .patch('/settings/clinic-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('name', 'Clínica Actualizada')
      .field('address', 'Calle Falsa 123, Sevilla')
      .field('phone', '954 000 000');

    expect(res.status).toBe(200);
    const body = res.body as ClinicProfileResponse;
    expect(body.name).toBe('Clínica Actualizada');
    expect(body.address).toBe('Calle Falsa 123, Sevilla');
    expect(body.phone).toBe('954 000 000');

    const otherTenant = await request(server)
      .get('/settings/clinic-profile')
      .set('Authorization', `Bearer ${tokenB}`);
    expect((otherTenant.body as ClinicProfileResponse).name).toBe(tenantB.name);
  });

  it('uploads a logo, then removes it', async () => {
    const withLogo = await request(server)
      .patch('/settings/clinic-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('name', 'Clínica Actualizada')
      .attach('logo', TINY_PNG, {
        filename: 'logo.png',
        contentType: 'image/png',
      });

    expect(withLogo.status).toBe(200);
    const bodyWithLogo = withLogo.body as ClinicProfileResponse;
    expect(bodyWithLogo.logo).toMatch(/^data:image\/png;base64,/);

    const removed = await request(server)
      .patch('/settings/clinic-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('name', 'Clínica Actualizada')
      .field('removeLogo', 'true');

    expect(removed.status).toBe(200);
    expect((removed.body as ClinicProfileResponse).logo).toBeNull();
  });

  // A real browser's <input type="file"> with nothing picked still ends up
  // as an empty file part in the submitted FormData (empty filename, zero
  // bytes) — this must be treated the same as "no file field at all", not
  // rejected as an invalid upload.
  it('treats an empty file part (nothing picked in the browser) as no logo change', async () => {
    const res = await request(server)
      .patch('/settings/clinic-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('name', 'Clínica Actualizada')
      .attach('logo', Buffer.alloc(0), {
        filename: '',
        contentType: 'application/octet-stream',
      });

    expect(res.status).toBe(200);
  });

  it('rejects a logo that is not an image', async () => {
    const res = await request(server)
      .patch('/settings/clinic-profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('name', 'Clínica Actualizada')
      .attach('logo', Buffer.from('not an image'), {
        filename: 'logo.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
  });

  it("lets superadmin read/update any clinic's profile via /platform", async () => {
    const res = await request(server)
      .patch(`/platform/tenants/${tenantB.id}/clinic-profile`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .field('name', 'Clínica B Renombrada')
      .field('phone', '954 111 111');

    expect(res.status).toBe(200);
    const body = res.body as ClinicProfileResponse;
    expect(body.name).toBe('Clínica B Renombrada');
    expect(body.phone).toBe('954 111 111');

    const get = await request(server)
      .get(`/platform/tenants/${tenantB.id}/clinic-profile`)
      .set('Authorization', `Bearer ${superadminToken}`);
    expect((get.body as ClinicProfileResponse).name).toBe(
      'Clínica B Renombrada',
    );
  });

  it('blocks admin/profesional from the platform clinic-profile route', async () => {
    const res = await request(server)
      .get(`/platform/tenants/${tenantA.id}/clinic-profile`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(403);
  });
});
