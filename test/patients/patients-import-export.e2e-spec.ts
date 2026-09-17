import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import * as XLSX from 'xlsx';
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

interface PatientResponse {
  id: string;
  firstName: string;
  lastName: string;
  documentId: string | null;
  profession: string | null;
}

interface PaginatedPatients {
  data: PatientResponse[];
  total: number;
}

interface ImportResult {
  totalRows: number;
  created: number;
  skipped: { row: number; reason: string }[];
}

// Used to build *upload* fixtures paired with csvRow() below — deliberately
// stays at the original 8 columns; a file simply not having "Nº de
// historia"/"Fecha de la primera cita" at all is a normal, valid case
// (those targets just go unmapped), unrelated to what a fresh export
// writes (see EXPORT_CSV_HEADER).
const CSV_HEADER =
  'Nombre,Apellidos,Documento,Fecha de nacimiento,Teléfono,Email,Dirección,Notas';

// What GET /patients/export actually writes now that patients-csv.util's
// COLUMNS also carries profession/legacyId/firstConsultationDate.
const EXPORT_CSV_HEADER = `${CSV_HEADER},Profesión,Nº de historia,Fecha de la primera cita`;

function csvRow(fields: {
  firstName: string;
  lastName: string;
  documentId: string;
  dateOfBirth?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}): string {
  return [
    fields.firstName,
    fields.lastName,
    fields.documentId,
    fields.dateOfBirth ?? '1990-01-01',
    fields.phone ?? '+34600000000',
    fields.email ?? '',
    fields.address ?? '',
    fields.notes ?? '',
  ].join(',');
}

describe('Patients — export/import CSV/XLSX', () => {
  let app: INestApplication;
  let server: Server;
  let owner: Pool;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let tokenA: string;
  let tokenB: string;

  let tabacoTypeId: string;
  let alcoholTypeId: string;

  beforeAll(async () => {
    owner = ownerPool();
    [tenantA, tenantB] = await createTestTenants(owner);

    // createTestTenants inserts tenants with raw SQL, bypassing
    // PlatformService.createTenant, so tenantA gets none of the 13
    // default antecedente_types a real tenant would — seed just the two
    // this file's legacy-import tests need. antecedente_types has FORCE
    // ROW LEVEL SECURITY, hence set_config first (same as
    // antecedentes.e2e-spec.ts).
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenantA.id,
      ]);
      const {
        rows: [tabaco],
      } = await client.query<{ id: string }>(
        `INSERT INTO public.antecedente_types (tenant_id, name, display_order) VALUES ($1, 'Tabaco', 0) RETURNING id`,
        [tenantA.id],
      );
      const {
        rows: [alcohol],
      } = await client.query<{ id: string }>(
        `INSERT INTO public.antecedente_types (tenant_id, name, display_order) VALUES ($1, 'Alcohol', 1) RETURNING id`,
        [tenantA.id],
      );
      tabacoTypeId = tabaco.id;
      alcoholTypeId = alcohol.id;
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    app = await createTestApp();
    server = app.getHttpServer() as Server;

    const loginA = await request(server)
      .post('/auth/login')
      .send({ identifier: tenantA.userEmail, password: tenantA.userPassword });
    const loginB = await request(server)
      .post('/auth/login')
      .send({ identifier: tenantB.userEmail, password: tenantB.userPassword });

    tokenA = (loginA.body as LoginResponse).accessToken;
    tokenB = (loginB.body as LoginResponse).accessToken;
    expect(tokenA).toBeDefined();
    expect(tokenB).toBeDefined();
  }, 30000);

  afterAll(async () => {
    await app.close();
    await destroyTestTenants(owner, [tenantA, tenantB]);
    await owner.end();
  });

  it('exports patients as CSV with the expected headers and rows', async () => {
    await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        firstName: 'Export',
        lastName: 'Uno',
        documentId: 'EXP-001',
        dateOfBirth: '1980-01-01',
        phone: '+34600000010',
      });

    const res = await request(server)
      .get('/patients/export?format=csv')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('pacientes.csv');
    // The leading char is the UTF-8 BOM — strip it before matching the header.
    const text = res.text.replace(/^\uFEFF/, '');
    expect(text.split('\n')[0].trim()).toBe(EXPORT_CSV_HEADER);
    expect(text).toContain('Export,Uno,EXP-001');
  });

  it('exports patients as XLSX with the correct content type', async () => {
    const res = await request(server)
      .get('/patients/export?format=xlsx')
      .set('Authorization', `Bearer ${tokenA}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('pacientes.xlsx');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });

  it('rejects an export request with an invalid format', async () => {
    const res = await request(server)
      .get('/patients/export?format=pdf')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
  });

  it("does not export another tenant's patients", async () => {
    await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        firstName: 'OtroTenant',
        lastName: 'Paciente',
        documentId: 'EXP-B-001',
        dateOfBirth: '1980-01-01',
        phone: '+34600000011',
      });

    const res = await request(server)
      .get('/patients/export?format=csv')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('OtroTenant');
  });

  it('imports valid rows from a CSV and reports the created count', async () => {
    const csv = [
      CSV_HEADER,
      csvRow({
        firstName: 'Import',
        lastName: 'Uno',
        documentId: 'IMP-001',
      }),
      csvRow({
        firstName: 'Import',
        lastName: 'Dos',
        documentId: 'IMP-002',
        notes: 'Nota con, coma y "comillas"',
      }),
    ].join('\n');

    const res = await request(server)
      .post('/patients/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from(csv, 'utf-8'), 'pacientes.csv');

    expect(res.status).toBe(201);
    const body = res.body as ImportResult;
    expect(body.totalRows).toBe(2);
    expect(body.created).toBe(2);
    expect(body.skipped).toHaveLength(0);

    const list = await request(server)
      .get('/patients?search=Import')
      .set('Authorization', `Bearer ${tokenA}`);
    expect((list.body as PaginatedPatients).total).toBe(2);
  });

  it('skips a row with a missing required field and reports why, without failing the whole import', async () => {
    const csv = [
      CSV_HEADER,
      csvRow({ firstName: 'Valido', lastName: 'Uno', documentId: 'IMP-010' }),
      // Empty firstName — required.
      csvRow({ firstName: '', lastName: 'SinNombre', documentId: 'IMP-011' }),
    ].join('\n');

    const res = await request(server)
      .post('/patients/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from(csv, 'utf-8'), 'pacientes.csv');

    expect(res.status).toBe(201);
    const body = res.body as ImportResult;
    expect(body.created).toBe(1);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0].row).toBe(2);
  });

  it('skips a row whose documentId already exists instead of failing the batch', async () => {
    await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        firstName: 'Ya',
        lastName: 'Existe',
        documentId: 'IMP-020',
        dateOfBirth: '1990-01-01',
        phone: '+34600000020',
      });

    const csv = [
      CSV_HEADER,
      csvRow({ firstName: 'Ya', lastName: 'Existe', documentId: 'IMP-020' }),
      csvRow({
        firstName: 'Nuevo',
        lastName: 'Paciente',
        documentId: 'IMP-021',
      }),
    ].join('\n');

    const res = await request(server)
      .post('/patients/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from(csv, 'utf-8'), 'pacientes.csv');

    expect(res.status).toBe(201);
    const body = res.body as ImportResult;
    expect(body.created).toBe(1);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0].reason).toContain('IMP-020');
  });

  it('imports a row with no Documento column at all, leaving documentId empty', async () => {
    const csv = [
      'Nombre,Apellidos,Fecha de nacimiento,Teléfono',
      'SinDoc,Uno,1990-06-15,+34600222333',
    ].join('\n');

    const res = await request(server)
      .post('/patients/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from(csv, 'utf-8'), 'pacientes.csv');

    expect(res.status).toBe(201);
    const body = res.body as ImportResult;
    expect(body.created).toBe(1);
    expect(body.skipped).toHaveLength(0);

    const list = await request(server)
      .get('/patients?search=SinDoc')
      .set('Authorization', `Bearer ${tokenA}`);
    const patients = (list.body as PaginatedPatients).data;
    expect(patients).toHaveLength(1);
    // Documento is optional — no column mapped means no value invented.
    expect(patients[0].documentId).toBeNull();
  });

  it('extracts a NIF/NIE embedded in Profesión as documentId when no Documento column exists', async () => {
    const csv = [
      'Nombre,Apellidos,Fecha de nacimiento,Teléfono,Profesión',
      'ConNif,Puro,1990-06-15,+34600222333,28883086P',
      'ConNif,Mixto,1991-07-16,+34600222444,MAESTRO 28556177K',
      'SinNif,Normal,1992-08-17,+34600222555,POLICIA LOCAL',
    ].join('\n');

    const res = await request(server)
      .post('/patients/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from(csv, 'utf-8'), 'pacientes.csv');

    expect(res.status).toBe(201);
    const body = res.body as ImportResult;
    expect(body.created).toBe(3);

    const list = await request(server)
      .get('/patients?search=ConNif')
      .set('Authorization', `Bearer ${tokenA}`);
    const patients = (list.body as PaginatedPatients).data;
    const puro = patients.find((p) => p.lastName === 'Puro')!;
    const mixto = patients.find((p) => p.lastName === 'Mixto')!;
    // Pure NIF: becomes the documentId, profession left empty rather than
    // storing the NIF a second time as free text.
    expect(puro.documentId).toBe('28883086P');
    expect(puro.profession).toBeNull();
    // NIF alongside a real profession: NIF goes to documentId, the
    // profession text survives with the NIF stripped out of it.
    expect(mixto.documentId).toBe('28556177K');
    expect(mixto.profession).toBe('MAESTRO');

    const normalList = await request(server)
      .get('/patients?search=SinNif')
      .set('Authorization', `Bearer ${tokenA}`);
    const normal = (normalList.body as PaginatedPatients).data[0];
    // No NIF-shaped text in Profesión: untouched, left empty like any
    // other Documento-less row.
    expect(normal.profession).toBe('POLICIA LOCAL');
    expect(normal.documentId).toBeNull();
  });

  it('accepts a day-first (DD/MM/AAAA) date of birth', async () => {
    const csv = [
      CSV_HEADER,
      csvRow({
        firstName: 'DiaPrimero',
        lastName: 'Uno',
        documentId: 'DATE-001',
        dateOfBirth: '05/11/1978',
      }),
    ].join('\n');

    const res = await request(server)
      .post('/patients/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from(csv, 'utf-8'), 'pacientes.csv');

    expect(res.status).toBe(201);
    const body = res.body as ImportResult;
    expect(body.created).toBe(1);
    expect(body.skipped).toHaveLength(0);
  });

  it('rejects a CSV missing a required column', async () => {
    const csv = 'Nombre,Apellidos\nIncompleto,Fila';

    const res = await request(server)
      .post('/patients/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from(csv, 'utf-8'), 'pacientes.csv');

    expect(res.status).toBe(400);
  });

  it('rejects an import request with no file attached', async () => {
    const res = await request(server)
      .post('/patients/import')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
  });

  it('rejects a file whose extension is not csv/xls/xlsx', async () => {
    const res = await request(server)
      .post('/patients/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from('not a spreadsheet'), 'pacientes.pdf');

    expect(res.status).toBe(400);
  });

  it('imports valid rows from an XLSX workbook (with a real date-typed cell)', async () => {
    const sheet = XLSX.utils.json_to_sheet([
      {
        Nombre: 'Xlsx',
        Apellidos: 'Uno',
        Documento: 'IMP-XLSX-001',
        'Fecha de nacimiento': new Date(1988, 5, 15), // real Date cell, not text
        Teléfono: '+34622333444',
      },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Pacientes');
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;

    const res = await request(server)
      .post('/patients/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', buffer, 'pacientes.xlsx');

    expect(res.status).toBe(201);
    const body = res.body as ImportResult;
    expect(body.created).toBe(1);
    expect(body.skipped).toHaveLength(0);

    const list = await request(server)
      .get('/patients?search=IMP-XLSX-001')
      .set('Authorization', `Bearer ${tokenA}`);
    const patients = (list.body as PaginatedPatients).data;
    expect(patients).toHaveLength(1);
    expect(patients[0].documentId).toBe('IMP-XLSX-001');
  });

  it('imports valid rows from a legacy XLS workbook', async () => {
    const sheet = XLSX.utils.json_to_sheet([
      {
        Nombre: 'Xls',
        Apellidos: 'Uno',
        Documento: 'IMP-XLS-001',
        'Fecha de nacimiento': '1992-02-02',
        Teléfono: '+34622333555',
      },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Pacientes');
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'biff8',
    }) as Buffer;

    const res = await request(server)
      .post('/patients/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', buffer, 'pacientes.xls');

    expect(res.status).toBe(201);
    const body = res.body as ImportResult;
    expect(body.created).toBe(1);
    expect(body.skipped).toHaveLength(0);
  });

  it('previews a file without importing anything, with headers/sample/suggested mapping', async () => {
    const csv = [
      CSV_HEADER,
      csvRow({ firstName: 'Preview', lastName: 'Uno', documentId: 'PREV-001' }),
    ].join('\n');

    const res = await request(server)
      .post('/patients/import/preview')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from(csv, 'utf-8'), 'pacientes.csv');

    expect(res.status).toBe(201);
    const body = res.body as {
      headers: string[];
      sampleRows: Record<string, string>[];
      suggestedMapping: Record<string, string>;
    };
    expect(body.headers).toContain('Documento');
    expect(body.sampleRows).toHaveLength(1);
    expect(body.sampleRows[0]['Documento']).toBe('PREV-001');
    expect(body.suggestedMapping.documentId).toBe('Documento');
    expect(body.suggestedMapping.firstName).toBe('Nombre');

    // Nothing should have actually been imported by a preview call.
    const list = await request(server)
      .get('/patients?search=PREV-001')
      .set('Authorization', `Bearer ${tokenA}`);
    expect((list.body as PaginatedPatients).total).toBe(0);
  });

  it('imports using an explicit column mapping instead of the auto-detected one', async () => {
    // Columns named like the legacy OTOLARYN desktop export — none of
    // these match the suggested Spanish labels, which is exactly the
    // scenario the mapping step exists for.
    const csv = [
      'NUMHISTORIA,NOMBRE,APELLIDOS,FNACIMIENTO,TEL',
      'MAP-001,Mapeado,Uno,1993-04-04,+34611000111',
    ].join('\n');

    const mapping = {
      documentId: 'NUMHISTORIA',
      firstName: 'NOMBRE',
      lastName: 'APELLIDOS',
      dateOfBirth: 'FNACIMIENTO',
      phone: 'TEL',
    };

    const res = await request(server)
      .post('/patients/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('mapping', JSON.stringify(mapping))
      .attach('file', Buffer.from(csv, 'utf-8'), 'legacy-export.csv');

    expect(res.status).toBe(201);
    const body = res.body as ImportResult;
    expect(body.created).toBe(1);
    expect(body.skipped).toHaveLength(0);

    const list = await request(server)
      .get('/patients?search=MAP-001')
      .set('Authorization', `Bearer ${tokenA}`);
    const patients = (list.body as PaginatedPatients).data;
    expect(patients).toHaveLength(1);
    expect(patients[0].documentId).toBe('MAP-001');
  });

  it('rejects an import whose explicit mapping is missing a required field', async () => {
    const csv = ['NUMHISTORIA,NOMBRE', 'MAP-002,Incompleto'].join('\n');
    const mapping = { documentId: 'NUMHISTORIA', firstName: 'NOMBRE' };

    const res = await request(server)
      .post('/patients/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('mapping', JSON.stringify(mapping))
      .attach('file', Buffer.from(csv, 'utf-8'), 'legacy-export.csv');

    expect(res.status).toBe(400);
  });

  it('rejects an import whose mapping field is not valid JSON', async () => {
    const csv = [
      CSV_HEADER,
      csvRow({ firstName: 'X', lastName: 'Y', documentId: 'MAP-003' }),
    ].join('\n');

    const res = await request(server)
      .post('/patients/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('mapping', '{not valid json')
      .attach('file', Buffer.from(csv, 'utf-8'), 'pacientes.csv');

    expect(res.status).toBe(400);
  });

  it('imported patients are isolated per tenant', async () => {
    const csv = [
      CSV_HEADER,
      csvRow({
        firstName: 'TenantB',
        lastName: 'Import',
        documentId: 'IMP-B-001',
      }),
    ].join('\n');

    await request(server)
      .post('/patients/import')
      .set('Authorization', `Bearer ${tokenB}`)
      .attach('file', Buffer.from(csv, 'utf-8'), 'pacientes.csv');

    const listA = await request(server)
      .get('/patients?search=TenantB')
      .set('Authorization', `Bearer ${tokenA}`);
    expect((listA.body as PaginatedPatients).total).toBe(0);
  });

  // Legacy-import fields: NUMHISTORIA -> legacy_id, aseguradora by name
  // (get-or-create), antecedentes from legacy-style columns. Headers here
  // match COLUMNS'/the seeded types' labels exactly, so suggestMapping
  // picks all of it up with no explicit mapping — same as a real
  // pacientes.xls column named exactly "Aseguradora"/"Tabaco" would.
  it('maps legacy fields: Nº de historia, aseguradora by name, and antecedentes with detalle', async () => {
    const csv = [
      'Nombre,Apellidos,Documento,Fecha de nacimiento,Teléfono,Nº de historia,Aseguradora,Tabaco,Alcohol',
      'Legado,Uno,LEG-001,1990-01-01,+34600000030,NH-100,ASISA,Sí,No',
      'Legado,Dos,LEG-002,1990-01-01,+34600000031,NH-101,ASISA,4-5,',
    ].join('\n');

    const res = await request(server)
      .post('/patients/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from(csv, 'utf-8'), 'pacientes.csv');

    expect(res.status).toBe(201);
    const body = res.body as ImportResult;
    expect(body.created).toBe(2);
    expect(body.skipped).toHaveLength(0);

    const list = await request(server)
      .get('/patients?search=Legado')
      .set('Authorization', `Bearer ${tokenA}`);
    const patients = (list.body as PaginatedPatients).data;
    const uno = patients.find((p) => p.documentId === 'LEG-001')!;
    const dos = patients.find((p) => p.documentId === 'LEG-002')!;

    const [unoFull, dosFull] = await Promise.all([
      request(server)
        .get(`/patients/${uno.id}`)
        .set('Authorization', `Bearer ${tokenA}`),
      request(server)
        .get(`/patients/${dos.id}`)
        .set('Authorization', `Bearer ${tokenA}`),
    ]);
    const unoBody = unoFull.body as {
      legacyId: string;
      insuranceEntityId: string;
    };
    const dosBody = dosFull.body as {
      legacyId: string;
      insuranceEntityId: string;
    };
    expect(unoBody.legacyId).toBe('NH-100');
    expect(dosBody.legacyId).toBe('NH-101');
    // Same aseguradora name in both rows -> one insurance_entities row,
    // not one per row.
    expect(unoBody.insuranceEntityId).toBeTruthy();
    expect(unoBody.insuranceEntityId).toBe(dosBody.insuranceEntityId);

    const [unoAntecedentes, dosAntecedentes] = await Promise.all([
      request(server)
        .get(`/patients/${uno.id}/antecedentes`)
        .set('Authorization', `Bearer ${tokenA}`),
      request(server)
        .get(`/patients/${dos.id}/antecedentes`)
        .set('Authorization', `Bearer ${tokenA}`),
    ]);
    type Marked = { antecedenteTypeId: string; detalle: string | null }[];
    const unoMarked = unoAntecedentes.body as Marked;
    const dosMarked = dosAntecedentes.body as Marked;
    // "Sí" -> marked, no detalle (a bare affirmative carries no nuance);
    // Alcohol="No" -> not marked at all, so only Tabaco is in the list.
    expect(unoMarked).toHaveLength(1);
    expect(unoMarked[0]).toMatchObject({
      antecedenteTypeId: tabacoTypeId,
      detalle: null,
    });
    expect(unoMarked.map((m) => m.antecedenteTypeId)).not.toContain(
      alcoholTypeId,
    );
    // "4-5" -> marked, with the text kept as detalle; Alcohol left blank
    // -> not marked.
    expect(dosMarked).toHaveLength(1);
    expect(dosMarked[0]).toMatchObject({
      antecedenteTypeId: tabacoTypeId,
      detalle: '4-5',
    });
    expect(dosMarked.map((m) => m.antecedenteTypeId)).not.toContain(
      alcoholTypeId,
    );
  });

  it('skips a row on re-import once its Nº de historia already exists', async () => {
    const csv = [
      'Nombre,Apellidos,Documento,Fecha de nacimiento,Teléfono,Nº de historia',
      'Repetido,Import,LEG-REPEAT,1990-01-01,+34600000032,NH-200',
    ].join('\n');

    const first = await request(server)
      .post('/patients/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from(csv, 'utf-8'), 'pacientes.csv');
    expect((first.body as ImportResult).created).toBe(1);

    const second = await request(server)
      .post('/patients/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from(csv, 'utf-8'), 'pacientes.csv');
    const secondBody = second.body as ImportResult;
    expect(secondBody.created).toBe(0);
    expect(secondBody.skipped).toHaveLength(1);
    expect(secondBody.skipped[0].reason).toContain('NH-200');
  });
});
