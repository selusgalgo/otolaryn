import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import request from 'supertest';
import { createTestApp } from '../rls/support/app';
import {
  createTestTenants,
  destroyTestTenants,
  TestTenant,
} from '../rls/support/fixtures';
import { ownerPool } from '../rls/support/pools';
import { WhatsappBookingPurgeService } from '../../src/whatsapp-booking/whatsapp-booking-purge.service';
import { WhatsappRemindersService } from '../../src/whatsapp-booking/whatsapp-reminders.service';
import { WhatsappCredentialCrypto } from '../../src/whatsapp-booking/whatsapp-credential-crypto';

const token = 'test_' + 'a'.repeat(48);
const prefix = '/integrations/whatsapp-booking';
type MessageReply = {
  reply: string;
  duplicate: boolean;
  menu?: {
    kind: string;
    options: { id: string; title: string }[];
    hasMore?: boolean;
  };
};

describe('WhatsApp booking isolation and booking', () => {
  let app: INestApplication;
  let server: Server;
  let owner: Pool;
  let tenants: [TestTenant, TestTenant];
  let practitioner: string;
  let otherPractitioner: string;
  let scheduledAt: string;
  let adminTokens: string[];
  const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

  beforeAll(async () => {
    owner = ownerPool();
    tenants = await createTestTenants(owner, { openAllHours: true });
    for (const [index, tenant] of tenants.entries()) {
      const result = await owner.query<{ id: string }>(
        `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
         VALUES ($1, $2, 'unused', 'profesional', 'Test', 'Profesional') RETURNING id`,
        [tenant.id, `whatsapp-${index}-${Date.now()}@test.local`],
      );
      if (index === 0) practitioner = result.rows[0].id;
      else otherPractitioner = result.rows[0].id;
    }
    process.env.WHATSAPP_BOOKING_TENANT_ID = tenants[0].id;
    process.env.WHATSAPP_BOOKING_TOKEN_SHA256 = createHash('sha256')
      .update(token)
      .digest('hex');
    // A foreign practitioner in a misconfigured allowlist must still be hidden.
    process.env.WHATSAPP_BOOKING_PRACTITIONERS = `${practitioner},${otherPractitioner}`;
    process.env.WHATSAPP_BOOKING_ALLOWED_PHONES =
      '+34600123456,+34600998877,+34600000111,+34600000222,+34600000000,+34600000333,+34600000444';
    await owner.query(
      `INSERT INTO iam.whatsapp_booking_settings (tenant_id, platform_enabled, clinic_enabled, practitioner_ids) VALUES ($1, true, true, $2::uuid[])`,
      [tenants[0].id, [practitioner, otherPractitioner]],
    );
    app = await createTestApp();
    server = app.getHttpServer() as Server;
    adminTokens = [];
    for (const tenant of tenants) {
      const login = await request(server)
        .post('/auth/login')
        .send({
          identifier: tenant.userEmail,
          password: tenant.userPassword,
        })
        .expect(200);
      adminTokens.push((login.body as { accessToken: string }).accessToken);
    }
  }, 30000);

  afterAll(async () => {
    await app?.close();
    if (tenants) await destroyTestTenants(owner, tenants);
    await owner?.end();
    delete process.env.WHATSAPP_BOOKING_TENANT_ID;
    delete process.env.WHATSAPP_BOOKING_TOKEN_SHA256;
    delete process.env.WHATSAPP_BOOKING_PRACTITIONERS;
    delete process.env.WHATSAPP_BOOKING_ALLOWED_PHONES;
    delete process.env.WHATSAPP_BOOKING_DEMO_SHARED_PHONE;
  });

  it('keeps settings scoped to each clinic and rejects foreign professionals', async () => {
    const configured = {
      clinicEnabled: true,
      askReason: true,
      horizonDays: 30,
      leadMinutes: 0,
      practitionerIds: [practitioner],
    };
    const initial = await request(server)
      .get('/settings/whatsapp-booking')
      .set('Authorization', `Bearer ${adminTokens[1]}`)
      .expect(200);
    expect(initial.body.platformEnabled).toBe(false);
    expect(initial.body.practitionerIds).toEqual([]);
    await request(server)
      .patch('/settings/whatsapp-booking')
      .set('Authorization', `Bearer ${adminTokens[1]}`)
      .send(configured)
      .expect(400);
    await request(server)
      .patch(`/platform/tenants/${tenants[0].id}/whatsapp-booking`)
      .set('Authorization', `Bearer ${adminTokens[1]}`)
      .send({ platformEnabled: true })
      .expect(403);
    await request(server)
      .patch('/settings/whatsapp-booking')
      .set('Authorization', `Bearer ${adminTokens[0]}`)
      .send({ ...configured, platformEnabled: true })
      .expect(400);
    await request(server)
      .patch('/settings/whatsapp-booking')
      .set('Authorization', `Bearer ${adminTokens[0]}`)
      .send({ ...configured, clinicEnabled: false })
      .expect(200);
    const paused = await request(server)
      .get(`${prefix}/practitioners`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(paused.body).toEqual([]);
    await request(server)
      .patch('/settings/whatsapp-booking')
      .set('Authorization', `Bearer ${adminTokens[0]}`)
      .send(configured)
      .expect(200);
    const email = `whatsapp-super-${Date.now()}@test.local`;
    const password = 'Super-WhatsApp-Test-123!';
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name) VALUES (NULL, $1, $2, 'superadmin', 'Test', 'Super')`,
      [email, await argon2.hash(password)],
    );
    try {
      const login = await request(server)
        .post('/auth/login')
        .send({ identifier: email, password })
        .expect(200);
      const auth = `Bearer ${login.body.accessToken as string}`;
      await request(server)
        .patch(`/platform/tenants/${tenants[0].id}/whatsapp-booking`)
        .set('Authorization', auth)
        .send({ platformEnabled: false })
        .expect(200);
      expect(
        (
          await request(server)
            .get(`${prefix}/practitioners`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200)
        ).body,
      ).toEqual([]);
      expect(
        (
          await request(server)
            .get(`/platform/tenants/${tenants[1].id}/whatsapp-booking`)
            .set('Authorization', auth)
            .expect(200)
        ).body.platformEnabled,
      ).toBe(false);
      await request(server)
        .patch(`/platform/tenants/${tenants[0].id}/whatsapp-booking`)
        .set('Authorization', auth)
        .send({ platformEnabled: true })
        .expect(200);
    } finally {
      await owner.query('DELETE FROM iam.users WHERE email = $1', [email]);
    }
  });

  it('enforces booking horizon and lead time in the integration', async () => {
    const config = {
      clinicEnabled: true,
      askReason: true,
      horizonDays: 1,
      leadMinutes: 0,
      practitionerIds: [practitioner],
    };
    const configure = (body: typeof config) =>
      request(server)
        .patch('/settings/whatsapp-booking')
        .set('Authorization', `Bearer ${adminTokens[0]}`)
        .send(body)
        .expect(200);
    await configure(config);
    await request(server)
      .get(`${prefix}/slots`)
      .query({ practitionerId: practitioner, date })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    const dates = await request(server)
      .get(`${prefix}/dates`)
      .query({ practitionerId: practitioner })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(dates.body).not.toContain(date);
    await configure({ ...config, horizonDays: 3, leadMinutes: 10080 });
    const noDates = await request(server)
      .get(`${prefix}/dates`)
      .query({ practitionerId: practitioner })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(noDates.body).toEqual([]);
    await configure({ ...config, horizonDays: 30 });
  });

  it('skips the reason question when the clinic disables it', async () => {
    const config = {
      clinicEnabled: true,
      askReason: false,
      horizonDays: 30,
      leadMinutes: 0,
      practitionerIds: [practitioner],
    };
    const update = (askReason: boolean) =>
      request(server)
        .patch('/settings/whatsapp-booking')
        .set('Authorization', `Bearer ${adminTokens[0]}`)
        .send({ ...config, askReason })
        .expect(200);
    await update(false);
    let sequence = 0;
    const send = async (text: string): Promise<MessageReply> =>
      (
        await request(server)
          .post(`${prefix}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            phone: '+34600000333',
            messageId: `no-reason-${++sequence}`,
            text,
          })
          .expect(201)
      ).body as MessageReply;
    for (const text of ['CITA', '1', date, '1', 'Test Opcion'])
      await send(text);
    const response = await send('01/01/1990');
    expect(response.menu?.kind).toBe('confirm');
    expect(response.reply).toContain('¿Te viene bien');
    await send('CANCELAR');
    await update(true);
  });

  it('allows distinct fictional identities on the explicitly configured demo phone only', async () => {
    const phone = '+34600000333';
    process.env.WHATSAPP_BOOKING_DEMO_SHARED_PHONE = phone;
    const reserve = async (
      firstName: string,
      dateOfBirth: string,
      key: string,
    ) => {
      const slots = await request(server)
        .get(`${prefix}/slots`)
        .query({ practitionerId: practitioner, date })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      return request(server)
        .post(`${prefix}/appointments`)
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({
          practitionerId: practitioner,
          scheduledAt: slots.body[0].scheduledAt,
          firstName,
          lastName: 'Ficticio',
          dateOfBirth,
          phone,
        })
        .expect(201);
    };
    try {
      const first = await reserve(
        'IdentidadUno',
        '1980-01-01',
        'demo-shared-1',
      );
      const second = await reserve(
        'IdentidadDos',
        '1980-01-01',
        'demo-shared-2',
      );
      expect(first.body.id).not.toBe(second.body.id);
      let sequence = 0;
      const send = async (text: string): Promise<MessageReply> =>
        (
          await request(server)
            .post(`${prefix}/messages`)
            .set('Authorization', `Bearer ${token}`)
            .send({
              phone,
              text,
              messageId: `demo-shared-cancel-${++sequence}`,
            })
            .expect(201)
        ).body as MessageReply;
      await send('CANCELAR CITA');
      expect((await send('01/01/1980')).reply).toContain(
        'nombre y los apellidos',
      );
      expect((await send('IdentidadDos Ficticio')).reply).toContain(
        'Estas son tus citas',
      );
      await send('1');
      expect((await send('SI')).reply).toContain('ha quedado cancelada');
      const client = await owner.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [
          tenants[0].id,
        ]);
        const result = await client.query(
          'SELECT id, status FROM public.appointments WHERE id = ANY($1::uuid[])',
          [[first.body.id, second.body.id]],
        );
        expect(result.rows).toEqual(
          expect.arrayContaining([
            { id: first.body.id, status: 'scheduled' },
            { id: second.body.id, status: 'cancelled' },
          ]),
        );
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    } finally {
      delete process.env.WHATSAPP_BOOKING_DEMO_SHARED_PHONE;
    }
  });

  it('fails closed without a valid credential and limits practitioners to its tenant', async () => {
    await request(server).get(`${prefix}/practitioners`).expect(401);
    await request(server)
      .get(`${prefix}/practitioners`)
      .set('Authorization', `Bearer ${'x'.repeat(48)}`)
      .expect(401);
    const list = await request(server)
      .get(`${prefix}/practitioners`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body).toEqual([
      { id: practitioner, firstName: 'Test', lastName: 'Profesional' },
    ]);
    const availableDates = await request(server)
      .get(`${prefix}/dates`)
      .query({ practitionerId: practitioner })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(availableDates.body).toContain(date);
    await request(server)
      .get(`${prefix}/dates`)
      .query({ practitionerId: otherPractitioner })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(server)
      .get(`${prefix}/dates`)
      .query({ practitionerId: practitioner })
      .expect(401);
    await request(server)
      .get(`${prefix}/slots`)
      .query({ practitionerId: otherPractitioner, date })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(server)
      .get('/patients')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    await request(server)
      .post(`${prefix}/messages`)
      .set('Authorization', `Bearer ${'x'.repeat(48)}`)
      .send({ phone: '+34699999999', messageId: 'bad-both', text: 'CITA' })
      .expect(401);
    const rejected = await request(server)
      .post(`${prefix}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+34699999999', messageId: 'not-allowed', text: 'CITA' })
      .expect(403);
    expect(rejected.body).toEqual({
      code: 'SENDER_NOT_ALLOWED',
      message: 'Remitente no autorizado',
    });
  });

  it('offers slots and atomically creates one booking for repeated messages', async () => {
    const available = await request(server)
      .get(`${prefix}/slots`)
      .query({ practitionerId: practitioner, date })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((available.body as unknown[]).length).toBeGreaterThan(20);
    scheduledAt = (available.body as { scheduledAt: string }[])[20].scheduledAt;
    const body = {
      practitionerId: practitioner,
      scheduledAt,
      firstName: 'Paciente',
      lastName: 'Ficticio',
      dateOfBirth: '1990-01-01',
      phone: '+34600123456',
    };
    const book = () =>
      request(server)
        .post(`${prefix}/appointments`)
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'whatsapp-message-1')
        .send(body);
    const [one, two] = await Promise.all([book(), book()]);
    expect(one.status).toBe(201);
    expect(two.status).toBe(201);
    expect((one.body as { id: string }).id).toBe(
      (two.body as { id: string }).id,
    );
    expect(one.body).not.toHaveProperty('patientId');
    const remaining = await request(server)
      .get(`${prefix}/slots`)
      .query({ practitionerId: practitioner, date })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (remaining.body as { scheduledAt: string }[]).map((s) => s.scheduledAt),
    ).not.toContain(scheduledAt);
    await request(server)
      .post(`${prefix}/appointments`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'whatsapp-message-2')
      .send({ ...body, firstName: 'Otra' })
      .expect(409);
    await request(server)
      .post(`${prefix}/appointments`)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(400);
  });

  it('prepares Flow delivery idempotently before the delivery claim', async () => {
    const body = { phone: '+34600000111', messageId: 'flow-notification-test' };
    const post = (path: string) =>
      request(server)
        .post(`${prefix}/${path}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
    const first = await post('delivery/prepare-flow').expect(201);
    expect(first.body).toEqual({ prepared: true, duplicate: false });
    const second = await post('delivery/prepare-flow').expect(201);
    expect(second.body).toEqual({ prepared: true, duplicate: true });
    const claim = await post('delivery/claim').expect(201);
    expect(claim.body.send).toBe(true);
    expect((await post('delivery/claim').expect(201)).body.send).toBe(false);
    await request(server)
      .post(`${prefix}/delivery/prepare-flow`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+34699999999', messageId: 'flow-other' })
      .expect(403);
  });

  it('guides the whole conversation and books only after explicit confirmation', async () => {
    const phone = '+34600998877';
    let sequence = 0;
    const send = async (
      text: string,
      messageId = `conversation-${++sequence}`,
    ): Promise<MessageReply> =>
      (
        await request(server)
          .post(`${prefix}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({ phone, text, messageId })
          .expect(201)
      ).body as MessageReply;
    const professionalMenu = await send('CITA', 'interactive-prof-menu');
    expect(professionalMenu.reply).toContain('Elige el profesional');
    expect(professionalMenu.menu?.options[0].id).toBe(`P:${practitioner}`);
    expect((await send('CITA', 'interactive-prof-menu')).menu).toEqual(
      professionalMenu.menu,
    );
    expect((await send('quiero una cita')).menu).toEqual(professionalMenu.menu);
    expect(
      (await send('P:00000000-0000-4000-8000-000000000000')).reply,
    ).toContain('No he podido identificarlo');
    const dates = await send(`P:${practitioner}`);
    expect(dates.menu?.kind).toBe('dates');
    const dateId = `D:${practitioner}:${date}`;
    expect(dates.menu?.options.map((option) => option.id)).toContain(dateId);
    expect(
      (
        await send(
          dateId.replace(practitioner, '00000000-0000-4000-8000-000000000000'),
        )
      ).reply,
    ).toContain('Elige una de las fechas');
    const naturalDateText = date.split('-').reverse().join('/');
    const slotReply = await send(naturalDateText);
    expect(slotReply.reply).toContain('Elige un horario');
    expect(slotReply.menu?.options[0].title).toMatch(/^\d{2}:\d{2}$/);
    expect(
      new Set(slotReply.menu?.options.map((option) => option.title)).size,
    ).toBe(slotReply.menu?.options.length);
    const slot = slotReply.menu?.options[0].id;
    expect(slot).toBeDefined();
    const wrongProfessional = slot!.replace(
      practitioner,
      '00000000-0000-4000-8000-000000000000',
    );
    expect((await send(wrongProfessional)).reply).toContain(
      'horarios de la lista',
    );
    const scheduledAt = slot!.slice(`S:${practitioner}:`.length);
    const time = new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(scheduledAt));
    expect((await send(`a las ${time}`)).reply).toContain('nombre');
    expect((await send('Nombre')).reply).toContain('nombre y apellidos juntos');
    expect((await send('Nombre Ficticio')).reply).toContain(
      'fecha de nacimiento',
    );
    expect((await send('29/02/1988')).reply).toContain('motivo');
    const confirmation = await send('Revisión de prueba');
    expect(confirmation.reply).toContain('¿Te viene bien');
    expect(confirmation.menu?.kind).toBe('confirm');
    const confirmId = confirmation.menu!.options[0].id;
    expect(
      (
        await send(
          confirmId.replace(
            practitioner,
            '00000000-0000-4000-8000-000000000000',
          ),
        )
      ).reply,
    ).toContain('Responde SI');
    expect((await send('tal vez')).reply).toContain('Responde SI');
    const [a, b] = await Promise.all([
      send(confirmId, 'confirmation-message'),
      send(confirmId, 'confirmation-message'),
    ]);
    expect(a.reply).toContain('está reservada');
    expect(a.menu?.kind).toBe('another');
    expect(a.reply).not.toContain('Referencia:');
    expect(a.reply).toBe(b.reply);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    await request(server)
      .post(`${prefix}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone, text: 'distinto', messageId: 'confirmation-message' })
      .expect(409);
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenants[0].id,
      ]);
      const sessions = await client.query(
        'SELECT state FROM public.whatsapp_booking_sessions',
      );
      expect(sessions.rows).toHaveLength(1);
      expect(sessions.rows[0].state.step).toBe('another');
      const booking = await client.query(
        `SELECT p.creation_source, a.booking_source, a.notes, a.status
         FROM public.patients p JOIN public.appointments a ON a.patient_id = p.id
         WHERE p.phone = $1`,
        [phone],
      );
      expect(booking.rows).toEqual([
        expect.objectContaining({
          creation_source: 'whatsapp',
          booking_source: 'whatsapp',
          notes: 'Revisión de prueba',
          status: 'scheduled',
        }),
      ]);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    const another = await send('OTRA_MISMA');
    expect(another.menu?.kind).toBe('professionals');
    const nextDates = await send(`P:${practitioner}`);
    expect(nextDates.menu?.options.map((o) => o.id)).toContain(dateId);
    const nextSlots = await send(dateId);
    expect(nextSlots.menu?.kind).toBe('slots');
    const nextStep = await send(nextSlots.menu!.options[0].id);
    expect(nextStep.reply).toContain('motivo');
    const nextConfirm = await send('Otra revisión');
    expect(nextConfirm.menu?.kind).toBe('confirm');
    expect((await send(nextConfirm.menu!.options[0].id)).reply).toContain(
      'está reservada',
    );
    const verifyReuse = await owner.connect();
    try {
      await verifyReuse.query('BEGIN');
      await verifyReuse.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenants[0].id,
      ]);
      const rows = await verifyReuse.query(
        'SELECT p.id, count(a.id)::int AS appointments FROM public.patients p JOIN public.appointments a ON a.patient_id = p.id WHERE p.phone = $1 GROUP BY p.id',
        [phone],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].appointments).toBe(2);
      await verifyReuse.query('ROLLBACK');
    } finally {
      verifyReuse.release();
    }
    const otherPerson = await send('OTRA_PERSONA');
    expect(otherPerson.menu?.kind).toBe('professionals');
    await send(`P:${practitioner}`);
    const otherSlots = await send(dateId);
    expect((await send(otherSlots.menu!.options[0].id)).reply).toContain(
      'nombre y apellidos',
    );
    await send('CANCELAR');
    expect((await send('CANCELAR CITA')).reply).toContain(
      'fecha de nacimiento',
    );
    expect((await send('01/01/1980')).reply).toContain('No encuentro');
    await send('CANCELAR CITA');
    expect((await send('29/02/1988')).reply).toContain('Estas son tus citas');
    expect((await send('1')).reply).toContain('¿Confirmas');
    expect((await send('SALIR')).reply).toContain('no he cancelado');
    const configureCancellation = (
      cancellationEnabled: boolean,
      cancellationNoticeHours: number,
    ) =>
      request(server)
        .patch('/settings/whatsapp-booking')
        .set('Authorization', `Bearer ${adminTokens[0]}`)
        .send({
          clinicEnabled: true,
          askReason: true,
          horizonDays: 30,
          leadMinutes: 0,
          practitionerIds: [practitioner],
          cancellationEnabled,
          cancellationNoticeHours,
        })
        .expect(200);
    await configureCancellation(false, 0);
    expect((await send('CANCELAR CITA')).reply).toContain(
      'a través de recepción',
    );
    await configureCancellation(true, 168);
    await send('CANCELAR CITA');
    expect((await send('29/02/1988')).reply).toContain('fuera de plazo');
    await configureCancellation(true, 0);
    await send('CANCELAR CITA');
    await send('29/02/1988');
    await send('1');
    await configureCancellation(true, 168);
    expect((await send('SI')).reply).toContain('No he podido cancelar');
    await configureCancellation(true, 0);
    await send('CANCELAR CITA');
    await send('29/02/1988');
    await send('1');
    expect((await send('SI')).reply).toContain('ha quedado cancelada');
    await send('CANCELAR CITA');
    await send('29/02/1988');
    await send('1');
    expect((await send('SI')).reply).toContain('ha quedado cancelada');
    await send('CANCELAR CITA');
    expect((await send('29/02/1988')).reply).toContain('No encuentro');
  });

  it('enforces clinic-specific types and hours and records a confirmed change for reception', async () => {
    const phone = '+34600000444';
    const auth = `Bearer ${adminTokens[0]}`;
    const typeId = randomUUID();
    const weekday = (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7;
    const defaults = {
      welcome: '',
      receptionPhone: '',
      receptionHours: '',
      reschedule: false,
      notifyReception: false,
      reminderHours: 0,
      reminderTemplateName: 'appointment_reminder',
      reminderTemplateLanguage: 'es_ES',
      visitTypes: [],
      restrictHours: false,
      hours: [],
    };
    const configure = (features: unknown) =>
      request(server)
        .patch('/settings/whatsapp-booking')
        .set('Authorization', auth)
        .send({
          clinicEnabled: true,
          askReason: false,
          horizonDays: 30,
          leadMinutes: 0,
          practitionerIds: [practitioner],
          features,
        })
        .expect(200);
    await configure({
      ...defaults,
      welcome: 'Bienvenido a Clínica Prueba',
      receptionPhone: '+34 900 000 000',
      receptionHours: 'Lunes a viernes',
      reschedule: true,
      notifyReception: true,
      restrictHours: true,
      reminderHours: 1,
      visitTypes: [
        {
          id: typeId,
          name: 'Primera visita',
          durationMinutes: 45,
          practitionerIds: [practitioner],
        },
      ],
      hours: [{ weekday, start: '10:00', end: '14:00' }],
    });
    let sequence = 0;
    const send = async (text: string): Promise<MessageReply> =>
      (
        await request(server)
          .post(`${prefix}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({ phone, text, messageId: `features-${++sequence}` })
          .expect(201)
      ).body as MessageReply;
    try {
      expect((await send('HOLA')).reply).toContain(
        'Bienvenido a Clínica Prueba',
      );
      expect((await send('RECEPCIÓN')).reply).toContain('+34 900 000 000');
      expect((await send('CITA')).reply).toContain('Primera visita');
      await send('1');
      await send('1');
      const choices = await send(date);
      expect(choices.reply).toContain('10:00');
      expect(choices.reply).not.toContain('09:');
      await send('1');
      await send('Paciente Funcionalidades');
      expect((await send('23/09/1987')).reply).toContain('recordatorio');
      await send('SI');
      expect((await send('SI')).reply).toContain('está reservada');
      const activity = () =>
        request(server)
          .get('/whatsapp-booking/activity')
          .set('Authorization', auth)
          .expect(200);
      const booked = (await activity()).body.events.find(
        (event: { kind: string; unread: boolean }) =>
          event.kind === 'booked' && event.unread,
      );
      const appointment = () =>
        request(server)
          .get(`/appointments/${booked.appointmentId}`)
          .set('Authorization', auth)
          .expect(200);
      const original = (await appointment()).body;
      expect(original.durationMinutes).toBe(45);

      const selectNewTime = async () => {
        await send('CAMBIAR CITA');
        await send('23/09/1987');
        await send('1');
        await send('1');
        await send(date);
        expect((await send('5')).reply).toContain('¿Confirmas el cambio');
      };
      await selectNewTime();
      expect((await appointment()).body.scheduledAt).toBe(original.scheduledAt);
      await send('SALIR');
      expect((await appointment()).body.scheduledAt).toBe(original.scheduledAt);
      await selectNewTime();
      expect((await send('SI')).reply).toContain('se ha cambiado');
      expect((await appointment()).body.scheduledAt).not.toBe(
        original.scheduledAt,
      );
      expect((await activity()).body.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            appointmentId: original.id,
            kind: 'rescheduled',
            unread: true,
          }),
        ]),
      );
      await request(server)
        .patch(`/whatsapp-booking/activity/${booked.id}/acknowledge`)
        .set('Authorization', `Bearer ${adminTokens[1]}`)
        .expect(200);
      expect((await activity()).body.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: booked.id, unread: true }),
        ]),
      );
      await request(server)
        .patch(`/whatsapp-booking/activity/${booked.id}/acknowledge`)
        .set('Authorization', auth)
        .expect(200);
      expect((await activity()).body.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: booked.id, unread: false }),
        ]),
      );

      // Move only the isolated fixture into the reminder window.
      const client = await owner.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [
          tenants[0].id,
        ]);
        await client.query(
          "UPDATE public.appointments SET scheduled_at = now() + interval '59 minutes' WHERE id = $1",
          [original.id],
        );
        await client.query('COMMIT');
      } finally {
        client.release();
      }
      const encryptionKey = 'ab'.repeat(32);
      const connectionClient = await owner.connect();
      try {
        await connectionClient.query('BEGIN');
        await connectionClient.query(
          "SELECT set_config('app.tenant_id', $1, true)",
          [tenants[0].id],
        );
        await connectionClient.query(
          `INSERT INTO public.whatsapp_tenant_connections
           (tenant_id,waba_id,phone_number_id,encrypted_access_token,status)
           VALUES ($1,'987654321','123456789',$2,'ready')`,
          [
            tenants[0].id,
            new WhatsappCredentialCrypto(encryptionKey).encrypt(
              tenants[0].id,
              'fake-token-for-test',
            ),
          ],
        );
        await connectionClient.query('COMMIT');
      } finally {
        connectionClient.release();
      }
      const connection = {
        WHATSAPP_REMINDER_GRAPH_VERSION: 'v25.0',
        WHATSAPP_CREDENTIAL_KEY: encryptionKey,
      };
      const before = Object.fromEntries(
        Object.keys(connection).map((key) => [key, process.env[key]]),
      );
      Object.assign(process.env, connection);
      const sender = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          new Response(
            JSON.stringify({ messages: [{ id: 'mock-accepted' }] }),
            { status: 200 },
          ),
        );
      try {
        const reminders = app.get(WhatsappRemindersService);
        await Promise.all([reminders.sendDue(), reminders.sendDue()]);
        expect(sender).toHaveBeenCalledTimes(1);
        const payload = JSON.parse(String(sender.mock.calls[0][1]?.body));
        expect(payload).toMatchObject({
          to: phone.slice(1),
          type: 'template',
        });
        expect((await activity()).body.reminders).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              appointmentId: original.id,
              status: 'accepted',
            }),
          ]),
        );
      } finally {
        sender.mockRestore();
        for (const [key, value] of Object.entries(before)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    } finally {
      await configure(defaults);
    }
  });

  it('rejects an interactive slot from an earlier page without selecting a different time', async () => {
    const phone = '+34600000000';
    let sequence = 0;
    const send = async (text: string): Promise<MessageReply> =>
      (
        await request(server)
          .post(`${prefix}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({ phone, text, messageId: `interactive-page-${++sequence}` })
          .expect(201)
      ).body as MessageReply;
    await send('CANCELAR');
    await send('CITA');
    await send('1');
    const firstPage = await send(date);
    expect(firstPage.reply).toContain('Más horarios');
    const oldSlot = firstPage.menu?.options[0].id;
    expect(oldSlot).toBeDefined();
    const secondPage = await send('MAS');
    const currentSlot = secondPage.menu?.options[0].id;
    expect(currentSlot).toBeDefined();
    expect(currentSlot).not.toBe(oldSlot);
    expect((await send(oldSlot!)).reply).toContain('No he encontrado esa hora');
    expect((await send(currentSlot!)).reply).toContain('nombre');
    await send('CANCELAR');
  });

  it('handles two people choosing the same slot without leaving an orphan patient', async () => {
    const converse = async (phone: string, prefixId: string, name: string) => {
      let sequence = 0;
      const send = async (text: string): Promise<MessageReply> =>
        (
          await request(server)
            .post(`${prefix}/messages`)
            .set('Authorization', `Bearer ${token}`)
            .send({ phone, text, messageId: `${prefixId}-${++sequence}` })
            .expect(201)
        ).body as MessageReply;
      for (const text of [
        'CITA',
        '1',
        date,
        '1',
        `${name} Competidor`,
        '1990-01-01',
        'OMITIR',
      ])
        await send(text);
      return () => send('SI');
    };
    const a = await converse('+34600000111', 'race-a', 'Alfa');
    const b = await converse('+34600000222', 'race-b', 'Beta');
    const [one, two] = await Promise.all([a(), b()]);
    expect(
      [one.reply, two.reply].filter((s: string) =>
        s.includes('está reservada'),
      ),
    ).toHaveLength(1);
    expect(
      [one.reply, two.reply].filter((s: string) =>
        s.includes('no he podido confirmar'),
      ),
    ).toHaveLength(1);
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenants[0].id,
      ]);
      const patients = await client.query(
        "SELECT id FROM public.patients WHERE last_name = 'Competidor'",
      );
      expect(patients.rows).toHaveLength(1);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('reuses an existing patient only when the identity matches in the configured clinic', async () => {
    const setup = await owner.connect();
    try {
      await setup.query('BEGIN');
      await setup.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenants[0].id,
      ]);
      await setup.query(
        "UPDATE public.patients SET creation_source='manual' WHERE id=$1",
        [tenants[0].patientId],
      );
      await setup.query('COMMIT');
    } finally {
      setup.release();
    }
    const available = await request(server)
      .get(`${prefix}/slots`)
      .query({ practitionerId: practitioner, date })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const chosen = (available.body as { scheduledAt: string }[])[0].scheduledAt;
    const payload = {
      practitionerId: practitioner,
      scheduledAt: chosen,
      firstName: tenants[0].patientFirstName,
      lastName: tenants[0].patientLastName,
      dateOfBirth: '1990-01-01',
      phone: '+34600000000',
    };
    await request(server)
      .post(`${prefix}/appointments`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'existing-patient')
      .send(payload)
      .expect(201);
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenants[0].id,
      ]);
      const rows = await client.query<{
        patient_id: string;
        booking_source: string;
        creation_source: string;
      }>(
        'SELECT a.patient_id, a.booking_source, p.creation_source FROM public.appointments a JOIN public.patients p ON p.id = a.patient_id WHERE a.patient_id = $1',
        [tenants[0].patientId],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toMatchObject({
        booking_source: 'whatsapp',
        creation_source: 'manual',
      });
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('isolates and expires incomplete conversations between clinics', async () => {
    const phone = '+34600000222';
    const send = (text: string, messageId: string) =>
      request(server)
        .post(`${prefix}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ phone, text, messageId })
        .expect(201);
    const started = await send('CITA', 'expiry-start');
    expect((started.body as MessageReply).reply).toContain(
      'Elige el profesional',
    );
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenants[1].id,
      ]);
      const hidden = await client.query(
        'SELECT state FROM public.whatsapp_booking_sessions',
      );
      expect(hidden.rows).toHaveLength(0);
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenants[0].id,
      ]);
      const expired = await client.query(
        "UPDATE public.whatsapp_booking_sessions SET updated_at = now() - interval '31 minutes' WHERE phone_hash = $1",
        [createHash('sha256').update(phone).digest('hex')],
      );
      expect(expired.rowCount).toBe(1);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const afterExpiry = await send('1', 'expiry-next');
    expect((afterExpiry.body as MessageReply).reply).toContain(
      'Elige el profesional',
    );
    await send('CANCELAR', 'expiry-cancel');
  });

  it('claims an outgoing reply once and keeps ambiguous sends for review', async () => {
    const phone = '+34600000222';
    const messageId = 'delivery-claim-test';
    const post = (path: string, body: object) =>
      request(server)
        .post(`${prefix}/${path}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
    await post('messages', { phone, messageId, text: 'CANCELAR' }).expect(201);
    const [first, second] = await Promise.all([
      post('delivery/claim', { phone, messageId }),
      post('delivery/claim', { phone, messageId }),
    ]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const responses = [first.body, second.body] as {
      send: boolean;
      attempt?: string;
      status: string;
    }[];
    const winner = responses.find((r) => r.send);
    expect(responses.filter((r) => r.send)).toHaveLength(1);
    expect(responses.find((r) => !r.send)?.status).toBe('claimed');
    await post('delivery/result', {
      phone,
      messageId,
      attempt: '00000000-0000-4000-8000-000000000001',
      result: 'sent',
    }).expect(409);
    await post('delivery/result', {
      phone,
      messageId,
      attempt: winner!.attempt,
      result: 'uncertain',
    }).expect(201);
    const again = await post('delivery/claim', { phone, messageId }).expect(
      201,
    );
    expect(again.body).toEqual({ send: false, status: 'uncertain' });
    await request(server).get('/whatsapp-booking/delivery-review').expect(401);
    await request(server)
      .get('/whatsapp-booking/delivery-review')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    const practitionerToken = new JwtService({
      secret: process.env.JWT_SECRET,
    }).sign({
      sub: practitioner,
      tenant_id: tenants[0].id,
      role: 'profesional',
      first_name: 'Test',
      last_name: 'Profesional',
    });
    await request(server)
      .get('/whatsapp-booking/delivery-review')
      .set('Authorization', `Bearer ${practitionerToken}`)
      .expect(403);
    const own = await request(server)
      .get('/whatsapp-booking/delivery-review')
      .set('Authorization', `Bearer ${adminTokens[0]}`)
      .expect(200);
    const foreign = await request(server)
      .get('/whatsapp-booking/delivery-review')
      .set('Authorization', `Bearer ${adminTokens[1]}`)
      .expect(200);
    const idHash = createHash('sha256').update(messageId).digest('hex');
    expect(own.body).toEqual([
      expect.objectContaining({ messageHash: idHash, status: 'uncertain' }),
    ]);
    expect(foreign.body).toEqual([]);
    const reviews = own.body as Record<string, unknown>[];
    expect(reviews[0]).not.toHaveProperty('phone');
    expect(reviews[0]).not.toHaveProperty('reply');
    await post('delivery/result', {
      phone,
      messageId,
      attempt: winner!.attempt,
      result: 'sent',
    }).expect(409);
    await post('delivery/claim', { phone: '+34600123456', messageId }).expect(
      404,
    );
    await post('delivery/claim', { phone: '+34699999999', messageId }).expect(
      403,
    );
    const deliveredId = 'delivery-sent-test';
    await post('messages', {
      phone,
      messageId: deliveredId,
      text: 'CANCELAR',
    }).expect(201);
    const claim = await post('delivery/claim', {
      phone,
      messageId: deliveredId,
    }).expect(201);
    const sent = {
      phone,
      messageId: deliveredId,
      attempt: (claim.body as { attempt: string }).attempt,
      result: 'sent',
    };
    await post('delivery/result', sent).expect(201);
    await post('delivery/result', sent).expect(201);
    expect(
      (
        await post('delivery/claim', { phone, messageId: deliveredId }).expect(
          201,
        )
      ).body,
    ).toEqual({ send: false, status: 'sent' });
  });

  it('flags responses left pending before a claim only after their grace period', async () => {
    const phone = '+34600000222';
    const messageId = 'stale-pending-review';
    const messageHash = createHash('sha256').update(messageId).digest('hex');
    await request(server)
      .post(`${prefix}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone, messageId, text: 'CANCELAR' })
      .expect(201);
    const review = async (index: number) =>
      (
        await request(server)
          .get('/whatsapp-booking/delivery-review')
          .set('Authorization', `Bearer ${adminTokens[index]}`)
          .expect(200)
      ).body as { messageHash: string; status: string }[];
    expect(
      (await review(0)).some((item) => item.messageHash === messageHash),
    ).toBe(false);
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenants[0].id,
      ]);
      await client.query(
        "UPDATE public.whatsapp_booking_receipts SET created_at = now() - interval '3 minutes' WHERE message_hash = $1",
        [messageHash],
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    expect(await review(0)).toContainEqual(
      expect.objectContaining({ messageHash, status: 'pending' }),
    );
    expect(
      (await review(1)).some((item) => item.messageHash === messageHash),
    ).toBe(false);
  });

  it('flags interrupted claims only after their grace period', async () => {
    const phone = '+34600000222';
    const messageId = 'stale-delivery-review';
    const post = (path: string, body: object) =>
      request(server)
        .post(`${prefix}/${path}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body);
    const review = async () =>
      (
        await request(server)
          .get('/whatsapp-booking/delivery-review')
          .set('Authorization', `Bearer ${adminTokens[0]}`)
          .expect(200)
      ).body as { messageHash: string; status: string }[];
    const messageHash = createHash('sha256').update(messageId).digest('hex');
    await post('messages', { phone, messageId, text: 'CANCELAR' }).expect(201);
    await post('delivery/claim', { phone, messageId }).expect(201);
    expect(
      (await review()).some((item) => item.messageHash === messageHash),
    ).toBe(false);
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenants[0].id,
      ]);
      await client.query(
        "UPDATE public.whatsapp_booking_receipts SET delivery_claimed_at = now() - interval '3 minutes' WHERE message_hash = $1",
        [messageHash],
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    expect(await review()).toContainEqual(
      expect.objectContaining({ messageHash, status: 'claimed' }),
    );
  });

  it('purges expired conversations and receipts only for the configured clinic', async () => {
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      for (const tenant of tenants) {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [
          tenant.id,
        ]);
        await client.query(
          `INSERT INTO public.whatsapp_booking_sessions (tenant_id, phone_hash, state, updated_at)
          VALUES ($1, 'purge-old', '{}', now() - interval '31 minutes'),
                 ($1, 'purge-fresh', '{}', now())`,
          [tenant.id],
        );
        await client.query(
          `INSERT INTO public.whatsapp_booking_receipts (tenant_id, message_hash, phone_hash, content_hash, reply, created_at)
          VALUES ($1, 'purge-old', 'phone', 'content', 'reply', now() - interval '25 hours'),
                 ($1, 'purge-fresh', 'phone', 'content', 'reply', now())`,
          [tenant.id],
        );
      }
      await client.query('COMMIT');
      await app.get(WhatsappBookingPurgeService).purgeExpired();
      await client.query('BEGIN');
      for (const [index, tenant] of tenants.entries()) {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [
          tenant.id,
        ]);
        for (const [table, key] of [
          ['whatsapp_booking_sessions', 'phone_hash'],
          ['whatsapp_booking_receipts', 'message_hash'],
        ]) {
          const rows = await client.query<{ value: string }>(
            `SELECT ${key} AS value FROM public.${table} WHERE ${key} LIKE 'purge-%' ORDER BY ${key}`,
          );
          expect(rows.rows.map((row) => row.value)).toEqual(
            index === 0 ? ['purge-fresh'] : ['purge-fresh', 'purge-old'],
          );
        }
      }
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
  it('books for a second fictional person on the explicitly shared demo number', async () => {
    const phone = '+34600000000';
    process.env.WHATSAPP_BOOKING_DEMO_SHARED_PHONE = phone;
    let sequence = 0;
    const send = async (text: string): Promise<MessageReply> =>
      (
        await request(server)
          .post(`${prefix}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({ phone, text, messageId: `another-person-${++sequence}` })
          .expect(201)
      ).body as MessageReply;
    try {
      const book = async (name: string, dob: string) => {
        const dates = await send(`P:${practitioner}`);
        const chosenDate = `D:${practitioner}:${date}`;
        expect(dates.menu!.options.map((option) => option.id)).toContain(
          chosenDate,
        );
        const slots = await send(chosenDate);
        expect((await send(slots.menu!.options[0].id)).reply).toContain(
          'nombre y apellidos',
        );
        await send(name);
        await send(dob);
        const confirmation = await send('Motivo ficticio');
        expect((await send(confirmation.menu!.options[0].id)).reply).toContain(
          'está reservada',
        );
      };
      await send('CITA');
      await book('Primera Persona', '01/01/1990');
      expect((await send('OTRA_PERSONA')).menu?.kind).toBe('professionals');
      await book('Segunda Persona', '02/02/1991');
      const client = await owner.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [
          tenants[0].id,
        ]);
        const result = await client.query(
          "SELECT count(DISTINCT p.id)::int AS patients, count(a.id)::int AS appointments FROM public.patients p JOIN public.appointments a ON a.patient_id = p.id WHERE p.phone = $1 AND p.first_name IN ('Primera', 'Segunda') AND p.last_name = 'Persona'",
          [phone],
        );
        expect(result.rows[0]).toEqual({ patients: 2, appointments: 2 });
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    } finally {
      delete process.env.WHATSAPP_BOOKING_DEMO_SHARED_PHONE;
    }
  });
});
