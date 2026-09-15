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
import { DEFAULT_ANTECEDENTE_TYPE_NAMES } from '../../src/antecedentes/default-antecedente-types';

interface LoginResponse {
  accessToken: string;
}

interface AntecedenteTypeResponse {
  id: string;
  name: string;
  active: boolean;
  displayOrder: number;
}

interface PatientAntecedenteResponse {
  antecedenteTypeId: string;
  detalle: string | null;
}

const RECEPCION_PASSWORD = 'AntecedentesTest-Recepcion1!';

describe('Antecedentes', () => {
  let app: INestApplication;
  let server: Server;
  let owner: Pool;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let tokenA: string;
  let tokenB: string;
  let tokenRecepcion: string;

  beforeAll(async () => {
    owner = ownerPool();
    [tenantA, tenantB] = await createTestTenants(owner);

    // createTestTenants inserts tenants with raw SQL, bypassing
    // PlatformService.createTenant — so unlike a real tenant created
    // through the app, it doesn't get the 13 default antecedente_types
    // seeded automatically. Seed them here the same way the historical
    // migration and createTenant both do: set_config first, since this
    // table has FORCE ROW LEVEL SECURITY.
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenantA.id,
      ]);
      for (const [index, name] of DEFAULT_ANTECEDENTE_TYPE_NAMES.entries()) {
        await client.query(
          `INSERT INTO public.antecedente_types (tenant_id, name, display_order) VALUES ($1, $2, $3)`,
          [tenantA.id, name, index],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const recepcionHash = await argon2.hash(RECEPCION_PASSWORD, {
      type: argon2.argon2id,
    });
    const recepcionEmail = `antecedentes-recepcion-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES ($1, $2, $3, 'recepcion', 'Test', 'Recepcion')`,
      [tenantA.id, recepcionEmail, recepcionHash],
    );

    app = await createTestApp();
    server = app.getHttpServer() as Server;

    const loginA = await request(server)
      .post('/auth/login')
      .send({ identifier: tenantA.userEmail, password: tenantA.userPassword });
    const loginB = await request(server)
      .post('/auth/login')
      .send({ identifier: tenantB.userEmail, password: tenantB.userPassword });
    const loginRecepcion = await request(server)
      .post('/auth/login')
      .send({ identifier: recepcionEmail, password: RECEPCION_PASSWORD });

    tokenA = (loginA.body as LoginResponse).accessToken;
    tokenB = (loginB.body as LoginResponse).accessToken;
    tokenRecepcion = (loginRecepcion.body as LoginResponse).accessToken;
    expect(tokenA).toBeDefined();
    expect(tokenB).toBeDefined();
    expect(tokenRecepcion).toBeDefined();
  }, 30000);

  afterAll(async () => {
    await app.close();
    await destroyTestTenants(owner, [tenantA, tenantB]);
    await owner.end();
  });

  it('lists the 13 seeded legacy antecedente types', async () => {
    const res = await request(server)
      .get('/antecedente-types')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    const names = (res.body as AntecedenteTypeResponse[]).map((t) => t.name);
    expect(names).toContain('Tabaco');
    expect(names).toContain('Alergias medicamentosas');
    expect(
      (res.body as AntecedenteTypeResponse[]).length,
    ).toBeGreaterThanOrEqual(13);
  });

  it('creates, deactivates and isolates a custom antecedente type', async () => {
    const created = await request(server)
      .post('/antecedente-types')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Antecedente de prueba' });
    expect(created.status).toBe(201);
    const id = (created.body as AntecedenteTypeResponse).id;

    const deactivated = await request(server)
      .patch(`/antecedente-types/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ active: false });
    expect(deactivated.status).toBe(200);
    expect((deactivated.body as AntecedenteTypeResponse).active).toBe(false);

    const listB = await request(server)
      .get('/antecedente-types')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(
      (listB.body as AntecedenteTypeResponse[]).some((t) => t.id === id),
    ).toBe(false);
  });

  it('marks and unmarks antecedentes for a patient, with and without detalle', async () => {
    const tabaco = await request(server)
      .get('/antecedente-types')
      .set('Authorization', `Bearer ${tokenA}`);
    const tabacoId = (tabaco.body as AntecedenteTypeResponse[]).find(
      (t) => t.name === 'Tabaco',
    )!.id;
    const alcoholId = (tabaco.body as AntecedenteTypeResponse[]).find(
      (t) => t.name === 'Alcohol',
    )!.id;

    const marked = await request(server)
      .put(`/patients/${tenantA.patientId}/antecedentes`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        items: [
          { antecedenteTypeId: tabacoId, detalle: '4-5 cigarrillos/día' },
          { antecedenteTypeId: alcoholId },
        ],
      });
    expect(marked.status).toBe(200);
    const body = marked.body as PatientAntecedenteResponse[];
    expect(body).toHaveLength(2);
    expect(body.find((i) => i.antecedenteTypeId === tabacoId)?.detalle).toBe(
      '4-5 cigarrillos/día',
    );
    expect(
      body.find((i) => i.antecedenteTypeId === alcoholId)?.detalle,
    ).toBeNull();

    // Full replace: dropping Alcohol from the submitted list unmarks it.
    const replaced = await request(server)
      .put(`/patients/${tenantA.patientId}/antecedentes`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items: [{ antecedenteTypeId: tabacoId }] });
    expect(replaced.status).toBe(200);
    expect(replaced.body as PatientAntecedenteResponse[]).toHaveLength(1);

    const read = await request(server)
      .get(`/patients/${tenantA.patientId}/antecedentes`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(read.body as PatientAntecedenteResponse[]).toHaveLength(1);
  });

  it('rejects marking an antecedente type that does not exist', async () => {
    const res = await request(server)
      .put(`/patients/${tenantA.patientId}/antecedentes`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        items: [{ antecedenteTypeId: '00000000-0000-4000-8000-000000000000' }],
      });
    expect(res.status).toBe(400);
  });

  it('forbids recepcion from reading or marking antecedentes', async () => {
    const read = await request(server)
      .get('/antecedente-types')
      .set('Authorization', `Bearer ${tokenRecepcion}`);
    expect(read.status).toBe(403);

    const write = await request(server)
      .put(`/patients/${tenantA.patientId}/antecedentes`)
      .set('Authorization', `Bearer ${tokenRecepcion}`)
      .send({ items: [] });
    expect(write.status).toBe(403);
  });
});
