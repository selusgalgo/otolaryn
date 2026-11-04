import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import * as argon2 from 'argon2';
import { ClinicalEntryDraftsPurgeService } from '../../src/clinical-entries/clinical-entry-drafts-purge.service';
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

interface EntryResponse {
  id: string;
  status: 'borrador' | 'firmada';
  chiefComplaint: string;
  diagnosis: string | null;
  draftExpiresAt: string | null;
  authorUserId: string;
}

interface ListResponse {
  data: EntryResponse[];
}

interface DashboardResponse {
  clinicalEntries: EntryResponse[] | null;
  drafts: EntryResponse[] | null;
}

const PASSWORD = 'DraftsTest-Passw0rd1!';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('Clinical entry drafts — visibilidad, ciclo de vida y caducidad', () => {
  let app: INestApplication;
  let server: Server;
  let owner: Pool;
  let tenant: TestTenant;
  let otherTenant: TestTenant;
  let tokenAdmin: string;
  let tokenDoctora: string;
  let tokenOtroProfesional: string;
  let tokenRecepcion: string;
  let doctoraId: string;
  let otroProfesionalId: string;
  const patient = () => tenant.patientId;

  async function insertUser(
    role: 'profesional' | 'recepcion',
    tag: string,
  ): Promise<{ email: string; id: string }> {
    const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const email = `drafts-${tag}-${Date.now()}@rls-test.local`;
    const {
      rows: [{ id }],
    } = await owner.query<{ id: string }>(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, $4, 'Drafts', $5) RETURNING id`,
      [tenant.id, email, hash, role, tag],
    );
    return { email, id };
  }

  async function login(identifier: string, password = PASSWORD) {
    const res = await request(server)
      .post('/auth/login')
      .send({ identifier, password });
    return (res.body as LoginResponse).accessToken;
  }

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createDraft(
    token: string,
    body: Record<string, unknown> = {},
  ): Promise<EntryResponse> {
    const res = await request(server)
      .post(`/patients/${patient()}/clinical-entry-drafts`)
      .set(as(token))
      .send(body);
    expect(res.status).toBe(201);
    return res.body as EntryResponse;
  }

  async function listFor(token: string): Promise<EntryResponse[]> {
    const res = await request(server)
      .get(`/patients/${patient()}/clinical-entries?pageSize=100`)
      .set(as(token));
    expect(res.status).toBe(200);
    return (res.body as ListResponse).data;
  }

  // El rol propietario no se salta RLS (FORCE ROW LEVEL SECURITY): hay que fijar
  // la clínica como hace la app antes de tocar clinical_entries.
  async function ownerQuery<T extends object = object>(
    sql: string,
    params: unknown[],
  ): Promise<T[]> {
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenant.id,
      ]);
      const result = await client.query<T>(sql, params);
      await client.query('COMMIT');
      return result.rows;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    owner = ownerPool();
    [tenant, otherTenant] = await createTestTenants(owner, {
      openAllHours: true,
    });
    const doctora = await insertUser('profesional', 'doctora');
    const otro = await insertUser('profesional', 'otro');
    const recepcion = await insertUser('recepcion', 'recepcion');
    doctoraId = doctora.id;
    otroProfesionalId = otro.id;

    app = await createTestApp();
    server = app.getHttpServer() as Server;
    tokenAdmin = await login(tenant.userEmail, tenant.userPassword);
    tokenDoctora = await login(doctora.email);
    tokenOtroProfesional = await login(otro.email);
    tokenRecepcion = await login(recepcion.email);
  }, 60000);

  afterAll(async () => {
    await app.close();
    await destroyTestTenants(owner, [tenant, otherTenant]);
    await owner.end();
  });

  it('crea un borrador incompleto (sin motivo) con fecha de caducidad a 10 días', async () => {
    const before = Date.now();
    const draft = await createDraft(tokenDoctora, { diagnosis: 'Otitis' });
    expect(draft.status).toBe('borrador');
    expect(draft.chiefComplaint).toBe('');
    expect(draft.diagnosis).toBe('Otitis');
    expect(draft.authorUserId).toBe(doctoraId);
    const expires = new Date(draft.draftExpiresAt as string).getTime();
    expect(expires).toBeGreaterThan(before + 10 * DAY_MS - 5000);
    expect(expires).toBeLessThan(Date.now() + 10 * DAY_MS + 5000);
  });

  it('lo ven el autor y el administrador, no otro profesional ni recepción', async () => {
    const draft = await createDraft(tokenDoctora, { chiefComplaint: 'Tos' });

    const ids = async (token: string) =>
      (await listFor(token)).filter((e) => e.id === draft.id);

    expect(await ids(tokenDoctora)).toHaveLength(1);
    expect((await ids(tokenDoctora))[0].status).toBe('borrador');
    expect(await ids(tokenAdmin)).toHaveLength(1);
    expect(await ids(tokenOtroProfesional)).toHaveLength(0);
    expect(await ids(tokenRecepcion)).toHaveLength(0);

    const get = (token: string) =>
      request(server).get(`/clinical-entries/${draft.id}`).set(as(token));
    expect((await get(tokenDoctora)).status).toBe(200);
    expect((await get(tokenAdmin)).status).toBe(200);
    expect((await get(tokenOtroProfesional)).status).toBe(404);
    expect((await get(tokenRecepcion)).status).toBe(404);
  });

  it('solo el autor edita el borrador (autoguardado); los demás reciben 403', async () => {
    const draft = await createDraft(tokenDoctora, { chiefComplaint: 'Dolor' });

    const ok = await request(server)
      .patch(`/clinical-entry-drafts/${draft.id}`)
      .set(as(tokenDoctora))
      .send({ diagnosis: 'Faringitis', treatment: '<p>Reposo</p>' });
    expect(ok.status).toBe(200);
    expect((ok.body as EntryResponse).diagnosis).toBe('Faringitis');
    expect((ok.body as EntryResponse).chiefComplaint).toBe('Dolor');

    for (const token of [tokenAdmin, tokenOtroProfesional]) {
      const denied = await request(server)
        .patch(`/clinical-entry-drafts/${draft.id}`)
        .set(as(token))
        .send({ diagnosis: 'No debería' });
      expect(denied.status).toBe(403);
    }
    const recepcion = await request(server)
      .patch(`/clinical-entry-drafts/${draft.id}`)
      .set(as(tokenRecepcion))
      .send({});
    expect(recepcion.status).toBe(403);
  });

  it('un borrador no se puede editar, eliminar ni imprimir como si fuera una consulta', async () => {
    const draft = await createDraft(tokenDoctora, {
      chiefComplaint: 'Mareo',
      treatment: '<p>Agua</p>',
    });
    const patch = await request(server)
      .patch(`/clinical-entries/${draft.id}`)
      .set(as(tokenAdmin))
      .send({ diagnosis: 'x' });
    expect(patch.status).toBe(409);
    const del = await request(server)
      .delete(`/clinical-entries/${draft.id}`)
      .set(as(tokenAdmin));
    expect(del.status).toBe(409);
    const pdf = await request(server)
      .get(`/clinical-entries/${draft.id}/treatment-pdf`)
      .set(as(tokenAdmin));
    expect(pdf.status).toBe(400);
  });

  it('firmar exige motivo; al firmar deja de ser borrador y lo ve todo el mundo', async () => {
    const draft = await createDraft(tokenDoctora, { diagnosis: 'Rinitis' });

    const sinMotivo = await request(server)
      .post(`/clinical-entry-drafts/${draft.id}/finalize`)
      .set(as(tokenDoctora))
      .send({ diagnosis: 'Rinitis' });
    expect(sinMotivo.status).toBe(400);

    const notAuthor = await request(server)
      .post(`/clinical-entry-drafts/${draft.id}/finalize`)
      .set(as(tokenAdmin))
      .send({ chiefComplaint: 'Congestión' });
    expect(notAuthor.status).toBe(403);

    const signed = await request(server)
      .post(`/clinical-entry-drafts/${draft.id}/finalize`)
      .set(as(tokenDoctora))
      .send({ chiefComplaint: 'Congestión', diagnosis: 'Rinitis alérgica' });
    expect(signed.status).toBe(200);
    const body = signed.body as EntryResponse;
    expect(body.status).toBe('firmada');
    expect(body.chiefComplaint).toBe('Congestión');
    expect(body.diagnosis).toBe('Rinitis alérgica');

    for (const token of [tokenRecepcion, tokenOtroProfesional, tokenAdmin]) {
      const seen = (await listFor(token)).find((e) => e.id === draft.id);
      expect(seen?.status).toBe('firmada');
      expect(seen?.draftExpiresAt).toBeNull();
    }
    const again = await request(server)
      .patch(`/clinical-entry-drafts/${draft.id}`)
      .set(as(tokenDoctora))
      .send({ diagnosis: 'otra vez' });
    expect(again.status).toBe(404);
  });

  it('descartar: lo pueden hacer el autor y el administrador, no otro profesional', async () => {
    const mine = await createDraft(tokenDoctora, { chiefComplaint: 'A' });
    const byAdmin = await createDraft(tokenDoctora, { chiefComplaint: 'B' });

    const other = await request(server)
      .delete(`/clinical-entry-drafts/${mine.id}`)
      .set(as(tokenOtroProfesional));
    expect(other.status).toBe(403);

    expect(
      (
        await request(server)
          .delete(`/clinical-entry-drafts/${mine.id}`)
          .set(as(tokenDoctora))
      ).status,
    ).toBe(204);
    expect(
      (
        await request(server)
          .delete(`/clinical-entry-drafts/${byAdmin.id}`)
          .set(as(tokenAdmin))
      ).status,
    ).toBe(204);

    const left = await listFor(tokenAdmin);
    expect(left.find((e) => e.id === mine.id)).toBeUndefined();
    expect(left.find((e) => e.id === byAdmin.id)).toBeUndefined();
  });

  it('no cuenta como historia: ni adelanta la primera consulta ni entra en el panel de hoy', async () => {
    const before = await request(server)
      .get(`/patients/${patient()}`)
      .set(as(tokenAdmin));
    const firstBefore = (
      before.body as { firstConsultationDate: string | null }
    ).firstConsultationDate;

    const draft = await createDraft(tokenDoctora, {
      chiefComplaint: 'Antigua',
      visitDate: '2001-01-01',
    });
    const after = await request(server)
      .get(`/patients/${patient()}`)
      .set(as(tokenAdmin));
    expect(
      (after.body as { firstConsultationDate: string | null })
        .firstConsultationDate,
    ).toBe(firstBefore);

    const today = new Date().toISOString().slice(0, 10);
    const todayDraft = await createDraft(tokenDoctora, {
      chiefComplaint: 'De hoy',
      visitDate: new Date().toISOString(),
    });
    const dash = await request(server)
      .get(`/dashboard/today?date=${today}`)
      .set(as(tokenDoctora));
    expect(dash.status).toBe(200);
    const dashBody = dash.body as DashboardResponse;
    expect(
      dashBody.clinicalEntries?.find((e) => e.id === todayDraft.id),
    ).toBeUndefined();
    expect(dashBody.drafts?.find((e) => e.id === todayDraft.id)).toBeDefined();
    expect(dashBody.drafts?.find((e) => e.id === draft.id)).toBeDefined();

    const asRecepcion = await request(server)
      .get(`/dashboard/today?date=${today}`)
      .set(as(tokenRecepcion));
    expect((asRecepcion.body as DashboardResponse).drafts).toBeNull();

    const asOther = await request(server)
      .get(`/dashboard/today?date=${today}`)
      .set(as(tokenOtroProfesional));
    expect(
      (asOther.body as DashboardResponse).drafts?.find(
        (e) => e.id === todayDraft.id,
      ),
    ).toBeUndefined();
  });

  it('un borrador caducado (10 días) deja de verse y de poder abrirse, y la tarea lo borra', async () => {
    const draft = await createDraft(tokenDoctora, { chiefComplaint: 'Vieja' });
    const fresh = await createDraft(tokenDoctora, { chiefComplaint: 'Fresca' });

    await ownerQuery(
      `UPDATE public.clinical_entries
         SET draft_updated_at = now() - interval '11 days' WHERE id = $1`,
      [draft.id],
    );

    const listed = await listFor(tokenAdmin);
    expect(listed.find((e) => e.id === draft.id)).toBeUndefined();
    expect(listed.find((e) => e.id === fresh.id)).toBeDefined();
    expect(
      (
        await request(server)
          .get(`/clinical-entries/${draft.id}`)
          .set(as(tokenAdmin))
      ).status,
    ).toBe(404);
    expect(
      (
        await request(server)
          .patch(`/clinical-entry-drafts/${draft.id}`)
          .set(as(tokenDoctora))
          .send({ diagnosis: 'x' })
      ).status,
    ).toBe(404);

    const purge = app.get(ClinicalEntryDraftsPurgeService);
    expect(await purge.purgeExpiredDrafts()).toBeGreaterThanOrEqual(1);
    const rows = await ownerQuery<{ id: string }>(
      `SELECT id FROM public.clinical_entries WHERE id = ANY($1::uuid[])`,
      [[draft.id, fresh.id]],
    );
    expect(rows.map((r) => r.id)).toEqual([fresh.id]);
  });

  it('eliminar a un profesional se lleva sus borradores, pero no si tiene consultas firmadas', async () => {
    const borrable = await insertUser('profesional', 'borrable');
    const tokenBorrable = await login(borrable.email);
    const draft = await createDraft(tokenBorrable, {
      chiefComplaint: 'Solo borrador',
    });

    const del = await request(server)
      .delete(`/users/${borrable.id}`)
      .set(as(tokenAdmin));
    expect(del.status).toBe(204);
    expect(
      (await listFor(tokenAdmin)).find((e) => e.id === draft.id),
    ).toBeUndefined();

    // El otro profesional firma una consulta: ya no se le puede eliminar.
    const d2 = await createDraft(tokenOtroProfesional, { chiefComplaint: 'x' });
    await request(server)
      .post(`/clinical-entry-drafts/${d2.id}/finalize`)
      .set(as(tokenOtroProfesional))
      .send({ chiefComplaint: 'Consulta firmada' })
      .expect(200);
    const blocked = await request(server)
      .delete(`/users/${otroProfesionalId}`)
      .set(as(tokenAdmin));
    expect(blocked.status).toBe(409);
  });

  it('no atraviesa clínicas: el borrador de una clínica es invisible desde otra', async () => {
    const draft = await createDraft(tokenDoctora, {
      chiefComplaint: 'Privado',
    });
    const tokenOtherAdmin = await login(
      otherTenant.userEmail,
      otherTenant.userPassword,
    );
    const res = await request(server)
      .get(`/clinical-entries/${draft.id}`)
      .set(as(tokenOtherAdmin));
    expect(res.status).toBe(404);
    const del = await request(server)
      .delete(`/clinical-entry-drafts/${draft.id}`)
      .set(as(tokenOtherAdmin));
    expect(del.status).toBe(404);
  });
});
