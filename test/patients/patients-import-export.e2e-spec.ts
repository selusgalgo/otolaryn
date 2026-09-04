import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
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
  documentId: string;
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

const CSV_HEADER =
  'Nombre,Apellidos,Documento,Fecha de nacimiento,Teléfono,Email,Dirección,Notas';

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

  beforeAll(async () => {
    owner = ownerPool();
    [tenantA, tenantB] = await createTestTenants(owner);

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
    expect(text.split('\n')[0].trim()).toBe(CSV_HEADER);
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
});
