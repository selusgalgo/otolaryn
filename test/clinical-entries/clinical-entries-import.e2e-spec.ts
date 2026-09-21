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

interface PatientResponse {
  id: string;
}

interface ImportPreviewResponse {
  headers: string[];
  suggestedMapping: Record<string, unknown>;
}

interface ImportDoctorsResponse {
  doctorNames: string[];
}

interface ImportResult {
  totalRows: number;
  created: number;
  skipped: { row: number; reason: string }[];
}

interface PaginatedEntries {
  data: {
    id: string;
    chiefComplaint: string;
    authorUserId: string;
    insuranceEntityId: string | null;
    visitDate: string;
  }[];
  total: number;
}

const DOCTOR_PASSWORD = 'ConsultasImport-Doctor1!';

describe('Consultas — import', () => {
  let app: INestApplication;
  let server: Server;
  let owner: Pool;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let tokenA: string;
  let doctorUserId: string;
  let patientId: string;

  beforeAll(async () => {
    owner = ownerPool();
    [tenantA, tenantB] = await createTestTenants(owner);

    const doctorHash = await argon2.hash(DOCTOR_PASSWORD, {
      type: argon2.argon2id,
    });
    const doctorEmail = `consultas-import-doctor-${Date.now()}@rls-test.local`;
    const {
      rows: [doctor],
    } = await owner.query<{ id: string }>(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, 'profesional', 'Federico', 'Sepúlveda') RETURNING id`,
      [tenantA.id, doctorEmail, doctorHash],
    );
    doctorUserId = doctor.id;

    app = await createTestApp();
    server = app.getHttpServer() as Server;

    const loginA = await request(server)
      .post('/auth/login')
      .send({ identifier: tenantA.userEmail, password: tenantA.userPassword });
    tokenA = (loginA.body as LoginResponse).accessToken;
    expect(tokenA).toBeDefined();

    // A patient with a legacy_id already set — as if imported earlier from
    // pacientes.xls — so a consulta row can relate to it by NUMHISTORIA.
    const patient = await request(server)
      .post('/patients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        firstName: 'Paciente',
        lastName: 'Legado',
        documentId: 'CONS-001',
        dateOfBirth: '1970-01-01',
        phone: '+34600000040',
        legacyId: 'NH-500',
      });
    patientId = (patient.body as PatientResponse).id;
  }, 30000);

  afterAll(async () => {
    await app.close();
    await destroyTestTenants(owner, [tenantA, tenantB]);
    await owner.end();
  });

  function csvFor(numHistoria: string, doctor: string, entidad = 'ASISA') {
    return [
      'Nombre,Apellidos,Motivo,Exploracion,Tratamiento,Fecha,Nº de historia,Aseguradora,Doctor',
      `Paciente,Legado,Dolor de oido,Otoscopia normal,Ibuprofeno,01/03/2024,${numHistoria},${entidad},${doctor}`,
    ].join('\n');
  }

  it('reads headers and suggests a mapping on preview', async () => {
    const res = await request(server)
      .post('/clinical-entries/import/preview')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach(
        'file',
        Buffer.from(csvFor('NH-500', 'Dr. Federico'), 'utf-8'),
        'consultas.csv',
      );

    expect(res.status).toBe(201);
    const body = res.body as ImportPreviewResponse;
    expect(body.headers).toContain('Motivo');
    expect(body.suggestedMapping).toMatchObject({
      chiefComplaint: 'Motivo',
      patientLegacyId: 'Nº de historia',
      insuranceEntityName: 'Aseguradora',
      doctorName: 'Doctor',
    });
  });

  it('lists every distinct doctor name found in the whole file', async () => {
    const csv = [
      'Motivo,Nº de historia,Doctor',
      'Uno,NH-500,Dr. Federico',
      'Dos,NH-500,Dr. Federico',
      'Tres,NH-500,Dr. Miguel',
    ].join('\n');

    const res = await request(server)
      .post('/clinical-entries/import/doctors')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('mapping', JSON.stringify({ doctorName: 'Doctor' }))
      .attach('file', Buffer.from(csv, 'utf-8'), 'consultas.csv');

    expect(res.status).toBe(201);
    expect((res.body as ImportDoctorsResponse).doctorNames).toEqual([
      'Dr. Federico',
      'Dr. Miguel',
    ]);
  });

  it('imports a consulta relating it to the patient by Nº de historia and resolving doctor + aseguradora', async () => {
    const res = await request(server)
      .post('/clinical-entries/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('doctorMapping', JSON.stringify({ 'Dr. Federico': doctorUserId }))
      .attach(
        'file',
        Buffer.from(csvFor('NH-500', 'Dr. Federico'), 'utf-8'),
        'consultas.csv',
      );

    expect(res.status).toBe(201);
    const body = res.body as ImportResult;
    expect(body.created).toBe(1);
    expect(body.skipped).toHaveLength(0);

    const entries = await request(server)
      .get(`/patients/${patientId}/clinical-entries`)
      .set('Authorization', `Bearer ${tokenA}`);
    const list = (entries.body as PaginatedEntries).data;
    expect(list).toHaveLength(1);
    expect(list[0].chiefComplaint).toBe('Dolor de oido');
    expect(list[0].authorUserId).toBe(doctorUserId);
    expect(list[0].insuranceEntityId).toBeTruthy();
    // FECHA never carries a real time of day — defaults to a plausible
    // 10:00 rather than the UTC-midnight-as-01:00 a bare date used to
    // produce (see toVisitDate in the service).
    expect(new Date(list[0].visitDate).getHours()).toBe(10);
  });

  it('skips a row whose Nº de historia has no matching patient', async () => {
    const res = await request(server)
      .post('/clinical-entries/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('doctorMapping', JSON.stringify({ 'Dr. Federico': doctorUserId }))
      .attach(
        'file',
        Buffer.from(csvFor('NH-DOES-NOT-EXIST', 'Dr. Federico'), 'utf-8'),
        'consultas.csv',
      );

    expect(res.status).toBe(201);
    const body = res.body as ImportResult;
    expect(body.created).toBe(0);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0].reason).toContain('NH-DOES-NOT-EXIST');
  });

  it('skips a row whose doctor was not mapped to a profesional', async () => {
    const res = await request(server)
      .post('/clinical-entries/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('doctorMapping', JSON.stringify({}))
      .attach(
        'file',
        Buffer.from(csvFor('NH-500', 'Dr. Sin Mapear'), 'utf-8'),
        'consultas.csv',
      );

    expect(res.status).toBe(201);
    const body = res.body as ImportResult;
    expect(body.created).toBe(0);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0].reason).toContain('Dr. Sin Mapear');
  });

  it('is idempotent: re-importing the exact same file skips every row instead of duplicating', async () => {
    // legacy_id is the row's position within *this* file (see
    // ClinicalEntry entity comment) — a leading row with no Motivo is
    // skipped before ever reaching that assignment, so the real row below
    // lands on legacy_id "2" instead of colliding with row 1 already
    // created by an earlier test in this same tenant.
    const csv = [
      'Motivo,Nº de historia,Doctor,Aseguradora',
      ',NH-500,Dr. Federico,MAPFRE',
      'Revision,NH-500,Dr. Federico,MAPFRE',
    ].join('\n');
    const doctorMapping = JSON.stringify({ 'Dr. Federico': doctorUserId });

    const first = await request(server)
      .post('/clinical-entries/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('doctorMapping', doctorMapping)
      .attach('file', Buffer.from(csv, 'utf-8'), 'consultas.csv');
    expect((first.body as ImportResult).created).toBe(1);

    const second = await request(server)
      .post('/clinical-entries/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('doctorMapping', doctorMapping)
      .attach('file', Buffer.from(csv, 'utf-8'), 'consultas.csv');
    // Row 1 is skipped both times for lacking a motivo (that's constant
    // between the two runs); row 2 is the one that flips from created to
    // skipped-as-already-imported the second time around.
    const secondBody = second.body as ImportResult;
    expect(secondBody.created).toBe(0);
    expect(secondBody.skipped).toHaveLength(2);
    expect(secondBody.skipped.find((s) => s.row === 2)?.reason).toBe(
      'Esta fila ya se había importado antes',
    );
  });

  it('skips a row whose name does not match the patient that Nº de historia resolves to', async () => {
    // Real legacy data confirmed this happens: the same NUMHISTORIA can
    // point to a different person between pacientes.xls and
    // consultas.xls, because the legacy system reused/reassigned historia
    // numbers over the years. NH-500 belongs to "Paciente Legado" — a row
    // claiming to be a completely different person under that same number
    // must be skipped for manual review, not silently attached to the
    // wrong patient.
    const csv = [
      'Nombre,Apellidos,Motivo,Nº de historia,Doctor',
      'Isabel,Domínguez Gutiérrez,Revision,NH-500,Dr. Federico',
    ].join('\n');

    const res = await request(server)
      .post('/clinical-entries/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('doctorMapping', JSON.stringify({ 'Dr. Federico': doctorUserId }))
      .attach('file', Buffer.from(csv, 'utf-8'), 'consultas.csv');

    expect(res.status).toBe(201);
    const body = res.body as ImportResult;
    expect(body.created).toBe(0);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0].reason).toContain('no coincide con el paciente');
  });

  it('tolerates a typo in the name and still imports the row', async () => {
    // Same real-data finding: minor typos in the legacy file ("Mnauel" for
    // "Manuel") must NOT be treated as a mismatch — the guard is a sanity
    // check against a wrong person, not a spellchecker.
    //
    // The two leading rows (no Motivo, skipped) push the real row to
    // legacy_id "3" — "1" and "2" are already taken by earlier tests in
    // this same tenant (see the idempotency test above), and legacy_id is
    // just this file's own row position, so a real row landing on "1" or
    // "2" here would collide with those instead of testing what this test
    // is actually about.
    const csv = [
      'Nombre,Apellidos,Motivo,Nº de historia,Doctor',
      ',,,NH-500,Dr. Federico',
      ',,,NH-500,Dr. Federico',
      'Pcaiente,Legaod,Revision,NH-500,Dr. Federico',
    ].join('\n');

    const res = await request(server)
      .post('/clinical-entries/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('doctorMapping', JSON.stringify({ 'Dr. Federico': doctorUserId }))
      .attach('file', Buffer.from(csv, 'utf-8'), 'consultas.csv');

    expect(res.status).toBe(201);
    const body = res.body as ImportResult;
    expect(body.created).toBe(1);
    expect(body.skipped).toHaveLength(2);
    expect(
      body.skipped.every((s) => s.reason === 'Falta el motivo de la consulta'),
    ).toBe(true);
  });

  it('forbids recepcion from importing consultas', async () => {
    const recepcionHash = await argon2.hash('ConsultasImport-Recep1!', {
      type: argon2.argon2id,
    });
    const recepcionEmail = `consultas-import-recepcion-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, 'recepcion', 'Test', 'Recepcion')`,
      [tenantA.id, recepcionEmail, recepcionHash],
    );
    const login = await request(server).post('/auth/login').send({
      identifier: recepcionEmail,
      password: 'ConsultasImport-Recep1!',
    });
    const tokenRecepcion = (login.body as LoginResponse).accessToken;

    const res = await request(server)
      .post('/clinical-entries/import')
      .set('Authorization', `Bearer ${tokenRecepcion}`)
      .field('doctorMapping', '{}')
      .attach(
        'file',
        Buffer.from(csvFor('NH-500', 'Dr. Federico'), 'utf-8'),
        'consultas.csv',
      );

    expect(res.status).toBe(403);
  });
});
