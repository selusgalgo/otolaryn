import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
}
interface AttachmentResponse {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey?: string;
}
interface ListedEntry {
  id: string;
  attachmentCount: number;
}

const PASSWORD = 'AttachTest-Passw0rd1!';
// Mínimos válidos por contenido: lo que se comprueba son los primeros bytes.
const PDF = Buffer.from('%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);

function filesIn(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.join(e.parentPath, e.name));
}

describe('Clinical entry attachments — PDF e imágenes en las consultas', () => {
  let app: INestApplication;
  let server: Server;
  let owner: Pool;
  let tenant: TestTenant;
  let otherTenant: TestTenant;
  let dir: string;
  let tokenAdmin: string;
  let tokenDoctora: string;
  let tokenOtro: string;
  let tokenRecepcion: string;
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function insertUser(role: 'profesional' | 'recepcion', tag: string) {
    const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const email = `attach-${tag}-${Date.now()}@rls-test.local`;
    const {
      rows: [{ id }],
    } = await owner.query<{ id: string }>(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, $4, 'Attach', $5) RETURNING id`,
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
  async function signedEntry(token = tokenDoctora): Promise<string> {
    const res = await request(server)
      .post(`/patients/${tenant.patientId}/clinical-entries`)
      .set(as(token))
      .send({ chiefComplaint: 'Consulta con adjuntos' });
    expect(res.status).toBe(201);
    return (res.body as EntryResponse).id;
  }
  async function draftEntry(token = tokenDoctora): Promise<string> {
    const res = await request(server)
      .post(`/patients/${tenant.patientId}/clinical-entry-drafts`)
      .set(as(token))
      .send({ chiefComplaint: 'Borrador con adjuntos' });
    expect(res.status).toBe(201);
    return (res.body as EntryResponse).id;
  }
  const upload = (
    entryId: string,
    token: string,
    buf: Buffer,
    filename = 'doc.pdf',
    contentType = 'application/pdf',
  ) =>
    request(server)
      .post(`/clinical-entries/${entryId}/attachments`)
      .set(as(token))
      .attach('file', buf, { filename, contentType });

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
      const r = await client.query<T>(sql, params);
      await client.query('COMMIT');
      return r.rows;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attachments-e2e-'));
    process.env.ATTACHMENTS_DIR = dir;
    owner = ownerPool();
    [tenant, otherTenant] = await createTestTenants(owner, {
      openAllHours: true,
    });
    const doctora = await insertUser('profesional', 'doctora');
    const otro = await insertUser('profesional', 'otro');
    const recepcion = await insertUser('recepcion', 'recepcion');
    app = await createTestApp();
    server = app.getHttpServer() as Server;
    tokenAdmin = await login(tenant.userEmail, tenant.userPassword);
    tokenDoctora = await login(doctora.email);
    tokenOtro = await login(otro.email);
    tokenRecepcion = await login(recepcion.email);
  }, 60000);

  afterAll(async () => {
    await app.close();
    await destroyTestTenants(owner, [tenant, otherTenant]);
    await owner.end();
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.ATTACHMENTS_DIR;
  });

  it('sube un PDF y una imagen a una consulta firmada, los lista y los descarga íntegros', async () => {
    const entryId = await signedEntry();
    const pdf = await upload(entryId, tokenDoctora, PDF, 'Analítica.pdf');
    expect(pdf.status).toBe(201);
    const body = pdf.body as AttachmentResponse;
    expect(body.mimeType).toBe('application/pdf');
    expect(body.originalName).toBe('Analítica.pdf');
    expect(body.sizeBytes).toBe(PDF.length);
    expect(body).not.toHaveProperty('storageKey');
    expect(
      (await upload(entryId, tokenDoctora, PNG, 'foto.png', 'image/png'))
        .status,
    ).toBe(201);

    const list = await request(server)
      .get(`/clinical-entries/${entryId}/attachments`)
      .set(as(tokenDoctora));
    expect(list.status).toBe(200);
    expect((list.body as AttachmentResponse[]).map((a) => a.mimeType)).toEqual([
      'application/pdf',
      'image/png',
    ]);

    const file = await request(server)
      .get(`/clinical-entry-attachments/${body.id}/file`)
      .set(as(tokenDoctora))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('application/pdf');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['content-security-policy']).toContain('sandbox');
    expect((file.body as Buffer).equals(PDF)).toBe(true);

    const entries = await request(server)
      .get(`/patients/${tenant.patientId}/clinical-entries?pageSize=100`)
      .set(as(tokenDoctora));
    const found = (entries.body as { data: ListedEntry[] }).data.find(
      (e) => e.id === entryId,
    );
    expect(found?.attachmentCount).toBe(2);
  });

  it('el tipo se decide por el contenido: SVG, HTML y texto se rechazan aunque se llamen .png o .pdf', async () => {
    const entryId = await signedEntry();
    const bad: Array<[string, Buffer, string]> = [
      [
        'dibujo.png',
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        ),
        'image/png',
      ],
      [
        'pagina.pdf',
        Buffer.from('<html><script>alert(1)</script></html>'),
        'application/pdf',
      ],
      ['notas.pdf', Buffer.from('solo texto'), 'application/pdf'],
      [
        'programa.exe',
        Buffer.from('MZ\x90\x00\x03'),
        'application/octet-stream',
      ],
    ];
    for (const [name, buf, type] of bad) {
      const res = await upload(entryId, tokenDoctora, buf, name, type);
      expect(res.status).toBe(415);
    }
    const list = await request(server)
      .get(`/clinical-entries/${entryId}/attachments`)
      .set(as(tokenDoctora));
    expect(list.body).toEqual([]);
  });

  it('rechaza más de 10 MB y más de 10 archivos por consulta', async () => {
    const entryId = await signedEntry();
    const big = Buffer.concat([
      Buffer.from('%PDF-1.7\n'),
      Buffer.alloc(10 * 1024 * 1024),
    ]);
    expect(
      (await upload(entryId, tokenDoctora, big, 'enorme.pdf')).status,
    ).toBe(413);

    for (let i = 0; i < 10; i++) {
      expect(
        (await upload(entryId, tokenDoctora, PDF, `doc${i}.pdf`)).status,
      ).toBe(201);
    }
    expect(
      (await upload(entryId, tokenDoctora, PDF, 'undecimo.pdf')).status,
    ).toBe(409);
  });

  it('recepción ve y descarga los adjuntos de una consulta firmada, pero no añade ni quita', async () => {
    const entryId = await signedEntry();
    const att = (await upload(entryId, tokenDoctora, PDF))
      .body as AttachmentResponse;

    expect(
      (
        await request(server)
          .get(`/clinical-entries/${entryId}/attachments`)
          .set(as(tokenRecepcion))
      ).status,
    ).toBe(200);
    expect(
      (
        await request(server)
          .get(`/clinical-entry-attachments/${att.id}/file`)
          .set(as(tokenRecepcion))
      ).status,
    ).toBe(200);
    expect((await upload(entryId, tokenRecepcion, PDF)).status).toBe(403);
    expect(
      (
        await request(server)
          .delete(`/clinical-entry-attachments/${att.id}`)
          .set(as(tokenRecepcion))
      ).status,
    ).toBe(403);
  });

  it('en una consulta firmada, otro profesional y un administrador también pueden añadir y quitar (editar)', async () => {
    const entryId = await signedEntry();
    const byOther = await upload(entryId, tokenOtro, PDF, 'resultado.pdf');
    expect(byOther.status).toBe(201);
    const byAdmin = await upload(
      entryId,
      tokenAdmin,
      PNG,
      'foto.png',
      'image/png',
    );
    expect(byAdmin.status).toBe(201);
    expect(
      (
        await request(server)
          .delete(
            `/clinical-entry-attachments/${(byOther.body as AttachmentResponse).id}`,
          )
          .set(as(tokenAdmin))
      ).status,
    ).toBe(204);
    const list = await request(server)
      .get(`/clinical-entries/${entryId}/attachments`)
      .set(as(tokenDoctora));
    expect(
      (list.body as AttachmentResponse[]).map((a) => a.originalName),
    ).toEqual(['foto.png']);
  });

  it('quitar un adjunto borra también el archivo del disco', async () => {
    const entryId = await signedEntry();
    const before = filesIn(dir).length;
    const att = (await upload(entryId, tokenDoctora, PDF))
      .body as AttachmentResponse;
    expect(filesIn(dir).length).toBe(before + 1);
    await request(server)
      .delete(`/clinical-entry-attachments/${att.id}`)
      .set(as(tokenDoctora))
      .expect(204);
    expect(filesIn(dir).length).toBe(before);
    expect(
      (
        await request(server)
          .get(`/clinical-entry-attachments/${att.id}/file`)
          .set(as(tokenDoctora))
      ).status,
    ).toBe(404);
  });

  it('los adjuntos de un borrador son solo del autor (administrador: ve, no modifica); recepción y otros, 404', async () => {
    const draftId = await draftEntry();
    const att = (await upload(draftId, tokenDoctora, PDF))
      .body as AttachmentResponse;

    expect(
      (
        await request(server)
          .get(`/clinical-entries/${draftId}/attachments`)
          .set(as(tokenAdmin))
      ).status,
    ).toBe(200);
    expect(
      (
        await request(server)
          .get(`/clinical-entry-attachments/${att.id}/file`)
          .set(as(tokenAdmin))
      ).status,
    ).toBe(200);
    expect((await upload(draftId, tokenAdmin, PDF)).status).toBe(403);
    expect(
      (
        await request(server)
          .delete(`/clinical-entry-attachments/${att.id}`)
          .set(as(tokenAdmin))
      ).status,
    ).toBe(403);

    for (const token of [tokenOtro, tokenRecepcion]) {
      expect(
        (
          await request(server)
            .get(`/clinical-entries/${draftId}/attachments`)
            .set(as(token))
        ).status,
      ).toBe(404);
      expect(
        (
          await request(server)
            .get(`/clinical-entry-attachments/${att.id}/file`)
            .set(as(token))
        ).status,
      ).toBe(404);
    }
    expect((await upload(draftId, tokenOtro, PDF)).status).toBe(404);
  });

  it('al firmar el borrador, sus adjuntos se quedan con la consulta', async () => {
    const draftId = await draftEntry();
    expect((await upload(draftId, tokenDoctora, PDF, 'antes.pdf')).status).toBe(
      201,
    );
    await request(server)
      .post(`/clinical-entry-drafts/${draftId}/finalize`)
      .set(as(tokenDoctora))
      .send({ chiefComplaint: 'Firmada con adjunto' })
      .expect(200);
    const list = await request(server)
      .get(`/clinical-entries/${draftId}/attachments`)
      .set(as(tokenRecepcion));
    expect(list.status).toBe(200);
    expect(
      (list.body as AttachmentResponse[]).map((a) => a.originalName),
    ).toEqual(['antes.pdf']);
  });

  it('descartar un borrador borra sus adjuntos de la BD y del disco', async () => {
    const draftId = await draftEntry();
    const before = filesIn(dir).length;
    await upload(draftId, tokenDoctora, PDF);
    await upload(draftId, tokenDoctora, PNG, 'x.png', 'image/png');
    expect(filesIn(dir).length).toBe(before + 2);

    await request(server)
      .delete(`/clinical-entry-drafts/${draftId}`)
      .set(as(tokenDoctora))
      .expect(204);
    expect(filesIn(dir).length).toBe(before);
    const rows = await ownerQuery(
      `SELECT 1 FROM public.clinical_entry_attachments WHERE clinical_entry_id = $1`,
      [draftId],
    );
    expect(rows).toHaveLength(0);
  });

  it('un borrador caducado y purgado se lleva sus archivos', async () => {
    const draftId = await draftEntry();
    const before = filesIn(dir).length;
    await upload(draftId, tokenDoctora, PDF);
    expect(filesIn(dir).length).toBe(before + 1);
    await ownerQuery(
      `UPDATE public.clinical_entries SET draft_updated_at = now() - interval '11 days' WHERE id = $1`,
      [draftId],
    );
    await app.get(ClinicalEntryDraftsPurgeService).purgeExpiredDrafts();
    expect(filesIn(dir).length).toBe(before);
  });

  it('eliminar al autor de un borrador borra los archivos de ese borrador', async () => {
    const borrable = await insertUser('profesional', 'borrable');
    const tokenBorrable = await login(borrable.email);
    const draftId = await draftEntry(tokenBorrable);
    const before = filesIn(dir).length;
    await upload(draftId, tokenBorrable, PDF);
    expect(filesIn(dir).length).toBe(before + 1);
    await request(server)
      .delete(`/users/${borrable.id}`)
      .set(as(tokenAdmin))
      .expect(204);
    expect(filesIn(dir).length).toBe(before);
  });

  it('no atraviesa clínicas', async () => {
    const entryId = await signedEntry();
    const att = (await upload(entryId, tokenDoctora, PDF))
      .body as AttachmentResponse;
    const tokenOtherAdmin = await login(
      otherTenant.userEmail,
      otherTenant.userPassword,
    );
    expect(
      (
        await request(server)
          .get(`/clinical-entries/${entryId}/attachments`)
          .set(as(tokenOtherAdmin))
      ).status,
    ).toBe(404);
    expect(
      (
        await request(server)
          .get(`/clinical-entry-attachments/${att.id}/file`)
          .set(as(tokenOtherAdmin))
      ).status,
    ).toBe(404);
    expect((await upload(entryId, tokenOtherAdmin, PDF)).status).toBe(404);
  });
});
