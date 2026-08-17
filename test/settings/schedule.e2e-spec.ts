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

interface TimeSlot {
  startTime: string;
  endTime: string;
}

interface DaySchedule {
  weekday: number;
  slots: TimeSlot[];
}

interface ScheduleResponse {
  days: DaySchedule[];
}

interface TenantScheduleResponse extends ScheduleResponse {
  tenantName: string;
}

const DEFAULT_WEEKDAY_SLOTS: TimeSlot[] = [
  { startTime: '09:00', endTime: '13:00' },
  { startTime: '16:00', endTime: '20:00' },
];

function closedWeek(): DaySchedule[] {
  return Array.from({ length: 7 }, (_, weekday) => ({ weekday, slots: [] }));
}

function defaultWeek(): DaySchedule[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    slots: weekday <= 4 ? DEFAULT_WEEKDAY_SLOTS : [],
  }));
}

const PROFESIONAL_PASSWORD = 'ScheduleTest-Profesional1!';
const SUPERADMIN_PASSWORD = 'ScheduleTest-Superadmin1!';

describe('Clinic schedule (Configuración) — time slots', () => {
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

  // Not defaultWeek() here on purpose: createTestTenants inserts tenantA
  // directly via SQL, bypassing PlatformService.createTenant() entirely —
  // the seeded default only ever gets applied by that service (see the
  // "seeds the default schedule" test below) or by the ClinicHoursSlots
  // migration's one-time backfill of tenants that already existed then.
  it('starts fully closed for a tenant created outside PlatformService', async () => {
    const res = await request(server)
      .get('/settings/schedule')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect((res.body as ScheduleResponse).days).toEqual(closedWeek());
  });

  it('lets profesional read the schedule but not write it', async () => {
    const read = await request(server)
      .get('/settings/schedule')
      .set('Authorization', `Bearer ${profesionalToken}`);
    expect(read.status).toBe(200);

    const write = await request(server)
      .patch('/settings/schedule')
      .set('Authorization', `Bearer ${profesionalToken}`)
      .send({ days: closedWeek() });
    expect(write.status).toBe(403);
  });

  it('rejects a payload with the wrong number of days', async () => {
    const res = await request(server)
      .patch('/settings/schedule')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ days: [{ weekday: 0, slots: [] }] });
    expect(res.status).toBe(400);
  });

  it('rejects overlapping slots on the same day', async () => {
    const days = closedWeek();
    days[0].slots = [
      { startTime: '09:00', endTime: '13:00' },
      { startTime: '12:00', endTime: '15:00' }, // overlaps the first
    ];
    const res = await request(server)
      .patch('/settings/schedule')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ days });
    expect(res.status).toBe(400);
  });

  it("lets admin set multiple slots (morning/afternoon) on their own clinic, without touching another tenant's", async () => {
    const days = closedWeek();
    days[0].slots = [
      { startTime: '10:00', endTime: '13:00' },
      { startTime: '17:00', endTime: '19:30' },
    ];

    const update = await request(server)
      .patch('/settings/schedule')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ days });
    expect(update.status).toBe(200);
    expect((update.body as ScheduleResponse).days).toEqual(days);

    const reread = await request(server)
      .get('/settings/schedule')
      .set('Authorization', `Bearer ${tokenA}`);
    expect((reread.body as ScheduleResponse).days).toEqual(days);

    // Tenant B was never touched — still fully closed, same as tenant A
    // was before this test.
    const tenantBSchedule = await request(server)
      .get('/settings/schedule')
      .set('Authorization', `Bearer ${tokenB}`);
    expect((tenantBSchedule.body as ScheduleResponse).days).toEqual(
      closedWeek(),
    );
  });

  it('leaves a day closed once every slot is removed from it', async () => {
    const closeMonday = closedWeek();
    // Every other day already has whatever tenant A ended up with above —
    // simplest to just send the fully-closed week here, this test only
    // cares that "no slots" round-trips as "no slots", not the exact
    // content of the other six days.
    const res = await request(server)
      .patch('/settings/schedule')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ days: closeMonday });
    expect(res.status).toBe(200);
    expect((res.body as ScheduleResponse).days).toEqual(closeMonday);
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
    expect(initialBody.days).toEqual(closedWeek());

    const days = closedWeek();
    days[6].slots = [{ startTime: '10:00', endTime: '14:00' }]; // Sunday only

    const update = await request(server)
      .patch(`/platform/tenants/${tenantB.id}/schedule`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ days });
    expect(update.status).toBe(200);
    expect((update.body as TenantScheduleResponse).days).toEqual(days);

    // Tenant A's schedule (already fully closed by the test above) is
    // untouched by this.
    const tenantAStillClosed = await request(server)
      .get('/settings/schedule')
      .set('Authorization', `Bearer ${tokenA}`);
    expect((tenantAStillClosed.body as ScheduleResponse).days).toEqual(
      closedWeek(),
    );
  });

  it('seeds the default schedule for a clinic created through the real superadmin flow', async () => {
    const newAdminEmail = `schedule-new-admin-${Date.now()}@rls-test.local`;
    const created = await request(server)
      .post('/platform/tenants')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        name: `Schedule-Test-New-Clinic-${Date.now()}`,
        adminEmail: newAdminEmail,
        adminFirstName: 'Nueva',
        adminLastName: 'Clinica',
        adminPassword: 'ScheduleTest-NewAdmin1!',
      });
    expect(created.status).toBe(201);
    const newTenantId = (created.body as { id: string }).id;

    const schedule = await request(server)
      .get(`/platform/tenants/${newTenantId}/schedule`)
      .set('Authorization', `Bearer ${superadminToken}`);
    expect(schedule.status).toBe(200);
    expect((schedule.body as TenantScheduleResponse).days).toEqual(
      defaultWeek(),
    );

    await owner.query(`DELETE FROM iam.clinic_hours WHERE tenant_id = $1`, [
      newTenantId,
    ]);
    await owner.query(`DELETE FROM iam.users WHERE tenant_id = $1`, [
      newTenantId,
    ]);
    await owner.query(`DELETE FROM iam.tenants WHERE id = $1`, [newTenantId]);
  });
});
