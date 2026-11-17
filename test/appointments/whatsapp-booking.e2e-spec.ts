import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
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

const token = 'test_' + 'a'.repeat(48);
const prefix = '/integrations/whatsapp-booking';
type MessageReply = { reply: string; duplicate: boolean; menu?: { kind: string; options: { id: string; title: string }[]; hasMore?: boolean } };

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
      '+34600123456,+34600998877,+34600000111,+34600000222,+34600000000';
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
    expect(professionalMenu.reply).toContain('elige profesional');
    expect(professionalMenu.menu?.options[0].id).toBe(`P:${practitioner}`);
    expect((await send('CITA', 'interactive-prof-menu')).menu).toEqual(professionalMenu.menu);
    expect((await send('P:00000000-0000-4000-8000-000000000000')).reply).toContain('profesional mostrado');
    const dates = await send(`P:${practitioner}`);
    expect(dates.menu?.kind).toBe('dates');
    const dateId = `D:${practitioner}:${date}`;
    expect(dates.menu?.options.map((option) => option.id)).toContain(dateId);
    expect((await send(dateId.replace(practitioner, '00000000-0000-4000-8000-000000000000'))).reply).toContain('fechas mostradas');
    const slotReply = await send(dateId);
    expect(slotReply.reply).toContain('Elige un horario');
    const slot = slotReply.menu?.options[0].id;
    expect(slot).toBeDefined();
    const wrongProfessional = slot!.replace(practitioner, '00000000-0000-4000-8000-000000000000');
    expect((await send(wrongProfessional)).reply).toContain('horarios mostrados');
    expect((await send(slot!)).reply).toContain('nombre');
    await send('Nombre');
    await send('Ficticio');
    const confirmation = await send('1988-02-29');
    expect(confirmation.reply).toContain('¿Confirmas');
    expect(confirmation.menu?.kind).toBe('confirm');
    const confirmId = confirmation.menu!.options[0].id;
    expect((await send(confirmId.replace(practitioner, '00000000-0000-4000-8000-000000000000'))).reply).toContain('Responde SI');
    expect((await send('tal vez')).reply).toContain('Responde SI');
    const [a, b] = await Promise.all([
      send(confirmId, 'confirmation-message'),
      send(confirmId, 'confirmation-message'),
    ]);
    expect(a.reply).toContain('está reservada');
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
      expect(sessions.rows).toHaveLength(0);
      await client.query('ROLLBACK');
    } finally {
      client.release();
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
    expect(firstPage.reply).toContain('Escribe MAS');
    const oldSlot = firstPage.menu?.options[0].id;
    expect(oldSlot).toBeDefined();
    const secondPage = await send('MAS');
    const currentSlot = secondPage.menu?.options[0].id;
    expect(currentSlot).toBeDefined();
    expect(currentSlot).not.toBe(oldSlot);
    expect((await send(oldSlot!)).reply).toContain('horarios mostrados');
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
        name,
        'Competidor',
        '1990-01-01',
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
        s.includes('No se ha podido confirmar'),
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
      const rows = await client.query<{ patient_id: string }>(
        'SELECT patient_id FROM public.appointments WHERE patient_id = $1',
        [tenants[0].patientId],
      );
      expect(rows.rows).toHaveLength(1);
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
    expect((started.body as MessageReply).reply).toContain('elige profesional');
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
        "UPDATE public.whatsapp_booking_sessions SET updated_at = now() - interval '31 minutes'",
      );
      expect(expired.rowCount).toBe(1);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const afterExpiry = await send('1', 'expiry-next');
    expect((afterExpiry.body as MessageReply).reply).toContain(
      'elige profesional',
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
});
