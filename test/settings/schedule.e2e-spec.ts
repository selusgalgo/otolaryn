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

interface ScheduleResponse {
  openDays: boolean[];
}

interface TenantScheduleResponse extends ScheduleResponse {
  tenantName: string;
}

const DEFAULT_SCHEDULE = [true, true, true, true, true, false, false];
const PROFESIONAL_PASSWORD = 'ScheduleTest-Profesional1!';
const SUPERADMIN_PASSWORD = 'ScheduleTest-Superadmin1!';

describe('Clinic schedule (Configuración)', () => {
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
    const profesionalEmail = `schedule-profesional-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, 'profesional', 'Schedule', 'Profesional')`,
      [tenantA.id, profesionalEmail, profesionalHash],
    );

    const superadminHash = await argon2.hash(SUPERADMIN_PASSWORD, {
      type: argon2.argon2id,
    });
    superadminEmail = `schedule-superadmin-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES (NULL, $1, $2, 'superadmin', 'Schedule', 'Superadmin')`,
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

  it('returns the default weekly schedule for a freshly created clinic', async () => {
    const res = await request(server)
      .get('/settings/schedule')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect((res.body as ScheduleResponse).openDays).toEqual(DEFAULT_SCHEDULE);
  });

  it('blocks profesional from the schedule endpoint entirely', async () => {
    const res = await request(server)
      .get('/settings/schedule')
      .set('Authorization', `Bearer ${profesionalToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects an array of the wrong length', async () => {
    const res = await request(server)
      .patch('/settings/schedule')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ openDays: [true, true, true] });
    expect(res.status).toBe(400);
  });

  it("lets admin update their own clinic's schedule, without touching another tenant's", async () => {
    const closedSunday = [true, true, true, true, true, true, false];
    const update = await request(server)
      .patch('/settings/schedule')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ openDays: closedSunday });
    expect(update.status).toBe(200);
    expect((update.body as ScheduleResponse).openDays).toEqual(closedSunday);

    const reread = await request(server)
      .get('/settings/schedule')
      .set('Authorization', `Bearer ${tokenA}`);
    expect((reread.body as ScheduleResponse).openDays).toEqual(closedSunday);

    // Tenant B was never touched — still the default.
    const tenantBSchedule = await request(server)
      .get('/settings/schedule')
      .set('Authorization', `Bearer ${tokenB}`);
    expect((tenantBSchedule.body as ScheduleResponse).openDays).toEqual(
      DEFAULT_SCHEDULE,
    );
  });

  it('blocks admin/profesional from the platform (any-clinic) schedule route', async () => {
    for (const token of [tokenA, profesionalToken]) {
      const res = await request(server)
        .get(`/platform/tenants/${tenantB.id}/schedule`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it('lets superadmin read and update a specific clinic chosen by id', async () => {
    const initial = await request(server)
      .get(`/platform/tenants/${tenantB.id}/schedule`)
      .set('Authorization', `Bearer ${superadminToken}`);
    expect(initial.status).toBe(200);
    const initialBody = initial.body as TenantScheduleResponse;
    expect(initialBody.tenantName).toBe(tenantB.name);
    expect(initialBody.openDays).toEqual(DEFAULT_SCHEDULE);

    const allClosed = [false, false, false, false, false, false, false];
    const update = await request(server)
      .patch(`/platform/tenants/${tenantB.id}/schedule`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ openDays: allClosed });
    expect(update.status).toBe(200);
    expect((update.body as TenantScheduleResponse).openDays).toEqual(allClosed);

    // Tenant A's schedule (already customized by admin above) is untouched.
    const tenantAStillCustom = await request(server)
      .get('/settings/schedule')
      .set('Authorization', `Bearer ${tokenA}`);
    expect((tenantAStillCustom.body as ScheduleResponse).openDays).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
  });
});
