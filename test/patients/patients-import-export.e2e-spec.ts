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
  phone: string;
  phone2: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
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

interface ImportJobProgress {
  jobId: string;
  status: 'running' | 'completed';
  totalRows: number;
  processedRows: number;
  created: number;
  skipped: { row: number; reason: string }[];
}

// POST /patients/import only kicks off a job now (see
// ImportJobsService) — this drives it to completion the way the real
// import dialog's polling loop does, and hands back a shape that reads
// like the old synchronous response so the rest of this file's
// assertions don't need to change.
async function runImport(
  server: Server,
  token: string,
  buffer: Buffer,
  filename: string,
  mapping?: Record<string, unknown>,
): Promise<{ status: number; body: ImportResult }> {
  let req = request(server)
    .post('/patients/import')
    .set('Authorization', `Bearer ${token}`);
  if (mapping) req = req.field('mapping', JSON.stringify(mapping));
  const start = await req.attach('file', buffer, filename);
  if (start.status !== 201) {
    return { status: start.status, body: start.body as ImportResult };
  }

  let progress = start.body as ImportJobProgress;
  while (progress.status !== 'completed') {
    const res = await request(server)
      .post(`/patients/import/${progress.jobId}/continue`)
      .set('Authorization', `Bearer ${token}`);
    progress = res.body as ImportJobProgress;
  }
  return {
    status: 201,
    body: {
      totalRows: progress.totalRows,
      created: progress.created,
      skipped: progress.skipped,
    },
  };
}

// Mirrors runImport above, but for the narrower "actualizar pacientes"
// wizard (see patients-csv.util.ts's update-mode section): same
// start-job/poll-continue shape, different endpoints, and the job never
// creates a patient — only ever updates one matched by Nº de historia.
async function runUpdateImport(
  server: Server,
  token: string,
  buffer: Buffer,
  filename: string,
  mapping?: Record<string, unknown>,
): Promise<{ status: number; body: ImportResult }> {
  let req = request(server)
    .post('/patients/import-update')
    .set('Authorization', `Bearer ${token}`);
  if (mapping) req = req.field('mapping', JSON.stringify(mapping));
  const start = await req.attach('file', buffer, filename);
  if (start.status !== 201) {
    return { status: start.status, body: start.body as ImportResult };
  }

  let progress = start.body as ImportJobProgress;
  while (progress.status !== 'completed') {
    const res = await request(server)
      .post(`/patients/import-update/${progress.jobId}/continue`)
      .set('Authorization', `Bearer ${token}`);
    progress = res.body as ImportJobProgress;
  }
  return {
    status: 201,
    body: {
      totalRows: progress.totalRows,
      created: progress.created,
      skipped: progress.skipped,
    },
  };
}

// Used to build *upload* fixtures paired with csvRow() below — deliberately
// stops short of "Nº de historia"; a file simply not having that at all is
// a normal, valid case (that target just goes unmapped), unrelated to
// what a fresh export writes (see EXPORT_CSV_HEADER).
const CSV_HEADER =
  'Nombre,Apellidos,Documento,Fecha de nacimiento,Teléfono,Teléfono 2,Email,Dirección,Notas';

// What GET /patients/export actually writes now that patients-csv.util's
// COLUMNS also carries profession/legacyId/firstConsultationDate.
const EXPORT_CSV_HEADER = `Nombre,Apellidos,Documento,Fecha de nacimiento,Teléfono,Teléfono 2,Email,Dirección,Ciudad/Población,Provincia,C.P.,Notas,Profesión,Nº de historia,Primera consulta`;

function csvRow(fields: {
  firstName: string;
  lastName: string;
  documentId: string;
  dateOfBirth?: string;
  phone?: string;
  phone2?: string;
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
    fields.phone2 ?? '',
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

    const res = await runImport(
      server,
      tokenA,
      Buffer.from(csv, 'utf-8'),
      'pacientes.csv',
    );

    expect(res.status).toBe(201);
    const body = res.body;
    expect(body.totalRows).toBe(2);
    expect(body.created).toBe(2);
    expect(body.skipped).toHaveLength(0);

    const list = await request(server)
      .get('/patients?search=Import')
      .set('Authorization', `Bearer ${tokenA}`);
    expect((list.body as PaginatedPatients).total).toBe(2);
  });

  it('splits two phone numbers crammed into one Teléfono cell into phone/phone2', async () => {
    // Real legacy data does this ("645575702/955761278") instead of using
    // a genuine second column — confirmed against a real sample of
    // pacientes.xls.
    const csv = [
      CSV_HEADER,
      csvRow({
        firstName: 'DosTelefonos',
        lastName: 'Uno',
        documentId: 'TEL-001',
        phone: '645575702/955761278',
      }),
    ].join('\n');

    const res = await runImport(
      server,
      tokenA,
      Buffer.from(csv, 'utf-8'),
      'pacientes.csv',
    );
    expect(res.body.created).toBe(1);

    const list = await request(server)
      .get('/patients?search=DosTelefonos')
      .set('Authorization', `Bearer ${tokenA}`);
    const patient = (list.body as PaginatedPatients).data[0];
    expect(patient.phone).toBe('645575702');
    expect(patient.phone2).toBe('955761278');
  });

  it('splits an unambiguous "calle - PROVINCIA" Dirección into address/province', async () => {
    // Real legacy data: "SALINAS Nº 8 LORA DEL RIO - SEVILLA" — confirmed
    // against a real sample of pacientes.xls. City stays unknown on
    // purpose (which town within Sevilla isn't derivable from this).
    const csv = [
      CSV_HEADER,
      csvRow({
        firstName: 'ConProvincia',
        lastName: 'Uno',
        documentId: 'DIR-001',
        address: 'SALINAS Nº 8 LORA DEL RIO - SEVILLA',
      }),
    ].join('\n');

    const res = await runImport(
      server,
      tokenA,
      Buffer.from(csv, 'utf-8'),
      'pacientes.csv',
    );
    expect(res.body.created).toBe(1);

    const list = await request(server)
      .get('/patients?search=ConProvincia')
      .set('Authorization', `Bearer ${tokenA}`);
    const patient = (list.body as PaginatedPatients).data[0];
    expect(patient.address).toBe('SALINAS Nº 8 LORA DEL RIO');
    expect(patient.province).toBe('Sevilla');
    expect(patient.city).toBeNull();
  });

  it('treats a Dirección cell with no digits or street markers as a bare Ciudad/Población', async () => {
    const csv = [
      CSV_HEADER,
      csvRow({
        firstName: 'SoloCiudad',
        lastName: 'Uno',
        documentId: 'DIR-002',
        address: 'Mairena del Alcor',
      }),
    ].join('\n');

    const res = await runImport(
      server,
      tokenA,
      Buffer.from(csv, 'utf-8'),
      'pacientes.csv',
    );
    expect(res.body.created).toBe(1);

    const list = await request(server)
      .get('/patients?search=SoloCiudad')
      .set('Authorization', `Bearer ${tokenA}`);
    const patient = (list.body as PaginatedPatients).data[0];
    expect(patient.city).toBe('Mairena del Alcor');
    expect(patient.address).toBeNull();
    expect(patient.province).toBeNull();
  });

  it('leaves an ambiguous Dirección (town mashed on with no separator) untouched', async () => {
    // Real legacy data: "CONDE DE BUSTILLO Nº 2 TRIANA" — Triana is a
    // Sevilla neighbourhood, not a separate town, and there's no separator
    // to signal a split was even intended. Left as address, not guessed.
    const csv = [
      CSV_HEADER,
      csvRow({
        firstName: 'Ambiguo',
        lastName: 'Uno',
        documentId: 'DIR-003',
        address: 'CONDE DE BUSTILLO Nº 2 TRIANA',
      }),
    ].join('\n');

    const res = await runImport(
      server,
      tokenA,
      Buffer.from(csv, 'utf-8'),
      'pacientes.csv',
    );
    expect(res.body.created).toBe(1);

    const list = await request(server)
      .get('/patients?search=Ambiguo')
      .set('Authorization', `Bearer ${tokenA}`);
    const patient = (list.body as PaginatedPatients).data[0];
    expect(patient.address).toBe('CONDE DE BUSTILLO Nº 2 TRIANA');
    expect(patient.city).toBeNull();
    expect(patient.province).toBeNull();
  });

  it('skips a row with a missing required field and reports why, without failing the whole import', async () => {
    const csv = [
      CSV_HEADER,
      csvRow({ firstName: 'Valido', lastName: 'Uno', documentId: 'IMP-010' }),
      // Empty firstName — required.
      csvRow({ firstName: '', lastName: 'SinNombre', documentId: 'IMP-011' }),
    ].join('\n');

    const res = await runImport(
      server,
      tokenA,
      Buffer.from(csv, 'utf-8'),
      'pacientes.csv',
    );

    expect(res.status).toBe(201);
    const body = res.body;
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

    const res = await runImport(
      server,
      tokenA,
      Buffer.from(csv, 'utf-8'),
      'pacientes.csv',
    );

    expect(res.status).toBe(201);
    const body = res.body;
    expect(body.created).toBe(1);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0].reason).toContain('IMP-020');
  });

  it('imports a row with no Documento column at all, leaving documentId empty', async () => {
    const csv = [
      'Nombre,Apellidos,Fecha de nacimiento,Teléfono',
      'SinDoc,Uno,1990-06-15,+34600222333',
    ].join('\n');

    const res = await runImport(
      server,
      tokenA,
      Buffer.from(csv, 'utf-8'),
      'pacientes.csv',
    );

    expect(res.status).toBe(201);
    const body = res.body;
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

    const res = await runImport(
      server,
      tokenA,
      Buffer.from(csv, 'utf-8'),
      'pacientes.csv',
    );

    expect(res.status).toBe(201);
    const body = res.body;
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

    const res = await runImport(
      server,
      tokenA,
      Buffer.from(csv, 'utf-8'),
      'pacientes.csv',
    );

    expect(res.status).toBe(201);
    const body = res.body;
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

    const res = await runImport(server, tokenA, buffer, 'pacientes.xlsx');

    expect(res.status).toBe(201);
    const body = res.body;
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

    const res = await runImport(server, tokenA, buffer, 'pacientes.xls');

    expect(res.status).toBe(201);
    const body = res.body;
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

    const res = await runImport(
      server,
      tokenA,
      Buffer.from(csv, 'utf-8'),
      'legacy-export.csv',
      mapping,
    );

    expect(res.status).toBe(201);
    const body = res.body;
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

    await runImport(server, tokenB, Buffer.from(csv, 'utf-8'), 'pacientes.csv');

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

    const res = await runImport(
      server,
      tokenA,
      Buffer.from(csv, 'utf-8'),
      'pacientes.csv',
    );

    expect(res.status).toBe(201);
    const body = res.body;
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

    const first = await runImport(
      server,
      tokenA,
      Buffer.from(csv, 'utf-8'),
      'pacientes.csv',
    );
    expect(first.body.created).toBe(1);

    const second = await runImport(
      server,
      tokenA,
      Buffer.from(csv, 'utf-8'),
      'pacientes.csv',
    );
    expect(second.body.created).toBe(0);
    expect(second.body.skipped).toHaveLength(1);
    expect(second.body.skipped[0].reason).toContain('NH-200');
  });

  // Actualizar pacientes: localiza por Nº de historia y solo toca Primera
  // consulta, Historia clínica y antecedentes — nunca el resto de la
  // ficha. Ver patients-csv.util.ts's update-mode section y
  // PatientsService.updateRow.
  describe('update mode (import-update)', () => {
    it('updates Primera consulta, Historia clínica and antecedentes for a patient matched by Nº de historia, leaving the rest of the record untouched', async () => {
      const createCsv = [
        'Nombre,Apellidos,Documento,Fecha de nacimiento,Teléfono,Nº de historia,Notas',
        'ActualizaUno,Test,UPD-001,1990-01-01,+34600000040,NH-UPD-1,Nota original',
      ].join('\n');
      const created = await runImport(
        server,
        tokenA,
        Buffer.from(createCsv, 'utf-8'),
        'pacientes.csv',
      );
      expect(created.body.created).toBe(1);

      const updateCsv = [
        'Nº de historia,Primera consulta,Historia clínica,Tabaco',
        'NH-UPD-1,15/03/2010,Historia clínica actualizada,Sí',
      ].join('\n');
      const res = await runUpdateImport(
        server,
        tokenA,
        Buffer.from(updateCsv, 'utf-8'),
        'actualizacion.csv',
      );
      expect(res.status).toBe(201);
      expect(res.body.created).toBe(1);
      expect(res.body.skipped).toHaveLength(0);

      const list = await request(server)
        .get('/patients?search=ActualizaUno')
        .set('Authorization', `Bearer ${tokenA}`);
      const patient = (list.body as PaginatedPatients).data[0];

      const full = await request(server)
        .get(`/patients/${patient.id}`)
        .set('Authorization', `Bearer ${tokenA}`);
      const body = full.body as {
        firstName: string;
        phone: string;
        notes: string | null;
        firstConsultationOverride: string | null;
      };
      expect(body.notes).toBe('Historia clínica actualizada');
      expect(body.firstConsultationOverride).toBe('2010-03-15');
      // El resto de la ficha, intacto.
      expect(body.firstName).toBe('ActualizaUno');
      expect(body.phone).toBe('+34600000040');

      const antecedentes = await request(server)
        .get(`/patients/${patient.id}/antecedentes`)
        .set('Authorization', `Bearer ${tokenA}`);
      type Marked = { antecedenteTypeId: string; detalle: string | null }[];
      expect(
        (antecedentes.body as Marked).map((m) => m.antecedenteTypeId),
      ).toContain(tabacoTypeId);
    });

    it('re-importing the exact same file reports nothing created the second time, even with antecedentes marked', async () => {
      // NH-UPD-1 ya quedó con Tabaco marcado por el test anterior — subir
      // el mismo fichero otra vez no debe volver a contarlo como
      // "actualizado": antecedenteRepo.upsert() es idempotente de por sí,
      // pero el contador `touched` tenía un bug que lo marcaba como
      // tocado en cada fila con algún antecedente, diera igual si el
      // upsert cambiaba algo o no.
      const updateCsv = [
        'Nº de historia,Primera consulta,Historia clínica,Tabaco',
        'NH-UPD-1,15/03/2010,Historia clínica actualizada,Sí',
      ].join('\n');
      const res = await runUpdateImport(
        server,
        tokenA,
        Buffer.from(updateCsv, 'utf-8'),
        'actualizacion.csv',
      );
      expect(res.status).toBe(201);
      expect(res.body.created).toBe(0);
      expect(res.body.skipped).toHaveLength(1);
      expect(res.body.skipped[0].reason).toContain('Nada que actualizar');
    });

    it('skips a row whose Nº de historia matches no existing patient', async () => {
      const updateCsv = [
        'Nº de historia,Primera consulta',
        'NH-UPD-NOPE,15/03/2010',
      ].join('\n');
      const res = await runUpdateImport(
        server,
        tokenA,
        Buffer.from(updateCsv, 'utf-8'),
        'actualizacion.csv',
      );
      expect(res.status).toBe(201);
      expect(res.body.created).toBe(0);
      expect(res.body.skipped).toHaveLength(1);
      expect(res.body.skipped[0].reason).toContain('NH-UPD-NOPE');
    });

    it('does not erase an existing Historia clínica when the file leaves the cell blank', async () => {
      // NH-UPD-1 ya tiene "Historia clínica actualizada" desde el primer
      // test de este describe — una celda vacía aquí no debe borrarla.
      const updateCsv = [
        'Nº de historia,Primera consulta,Historia clínica',
        'NH-UPD-1,,',
      ].join('\n');
      await runUpdateImport(
        server,
        tokenA,
        Buffer.from(updateCsv, 'utf-8'),
        'actualizacion.csv',
      );

      const list = await request(server)
        .get('/patients?search=ActualizaUno')
        .set('Authorization', `Bearer ${tokenA}`);
      const patient = (list.body as PaginatedPatients).data[0];
      const full = await request(server)
        .get(`/patients/${patient.id}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect((full.body as { notes: string | null }).notes).toBe(
        'Historia clínica actualizada',
      );
    });

    it('maps a legacy column to only the familiar antecedente when the same name exists in both categories, and removes any stray personal mark', async () => {
      // Siembra "Tumores" en ambas categorías — justo la ambigüedad que
      // suggestAntecedenteMapping existe para resolver (ver
      // patients-csv.util.ts): una sola columna legada con ese nombre debe
      // terminar marcando solo la familiar.
      const client = await owner.connect();
      let tumoresFamiliarId: string;
      let tumoresPersonalId: string;
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
          tenantA.id,
        ]);
        const {
          rows: [familiar],
        } = await client.query<{ id: string }>(
          `INSERT INTO public.antecedente_types (tenant_id, name, category, display_order) VALUES ($1, 'Tumores', 'familiar', 2) RETURNING id`,
          [tenantA.id],
        );
        const {
          rows: [personal],
        } = await client.query<{ id: string }>(
          `INSERT INTO public.antecedente_types (tenant_id, name, category, display_order) VALUES ($1, 'Tumores', 'personal', 3) RETURNING id`,
          [tenantA.id],
        );
        tumoresFamiliarId = familiar.id;
        tumoresPersonalId = personal.id;
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      const createCsv = [
        'Nombre,Apellidos,Documento,Fecha de nacimiento,Teléfono,Nº de historia',
        'ActualizaDos,Test,UPD-002,1990-01-01,+34600000041,NH-UPD-2',
      ].join('\n');
      const created = await runImport(
        server,
        tokenA,
        Buffer.from(createCsv, 'utf-8'),
        'pacientes.csv',
      );
      expect(created.body.created).toBe(1);

      const list = await request(server)
        .get('/patients?search=ActualizaDos')
        .set('Authorization', `Bearer ${tokenA}`);
      const patient = (list.body as PaginatedPatients).data[0];

      // El paciente ya está (mal) marcado como "personal" — el bug
      // original que esta actualización tiene que corregir.
      await request(server)
        .put(`/patients/${patient.id}/antecedentes`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          category: 'personal',
          items: [{ antecedenteTypeId: tumoresPersonalId }],
        });

      const updateCsv = ['Nº de historia,Tumores', 'NH-UPD-2,Sí'].join('\n');
      const res = await runUpdateImport(
        server,
        tokenA,
        Buffer.from(updateCsv, 'utf-8'),
        'actualizacion.csv',
      );
      expect(res.status).toBe(201);
      expect(res.body.created).toBe(1);

      const antecedentes = await request(server)
        .get(`/patients/${patient.id}/antecedentes`)
        .set('Authorization', `Bearer ${tokenA}`);
      type Marked = { antecedenteTypeId: string; detalle: string | null }[];
      const marked = (antecedentes.body as Marked).map(
        (m) => m.antecedenteTypeId,
      );
      expect(marked).toContain(tumoresFamiliarId);
      expect(marked).not.toContain(tumoresPersonalId);
    });
  });
});
