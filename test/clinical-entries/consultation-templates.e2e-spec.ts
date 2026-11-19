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

interface ClinicalEntryResponse {
  id: string;
  chiefComplaint: string;
  evolution: string | null;
  report: string | null;
  referringDoctor: string | null;
}

interface PatientResponse {
  id: string;
  gender: string | null;
  insuranceNumber: string | null;
}

const SUPERADMIN_PASSWORD = 'Templates-Superadmin1!';

// Plantillas de consulta por clínica + campos nuevos (Evolución, Informe,
// Doctor que lo envía) + Género / Nº de seguro privado del paciente.
describe('Consultation templates and new patient/consulta fields', () => {
  let app: INestApplication;
  let server: Server;
  let owner: Pool;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let tokenA: string;
  let tokenB: string;
  let tokenSuperadmin: string;
  let superadminEmail: string;

  beforeAll(async () => {
    owner = ownerPool();
    [tenantA, tenantB] = await createTestTenants(owner);

    superadminEmail = `templates-superadmin-${Date.now()}@rls-test.local`;
    await owner.query(
      `INSERT INTO iam.users (tenant_id, email, password_hash, role, first_name, last_name)
       VALUES (NULL, $1, $2, 'superadmin', 'Templates', 'Superadmin')`,
      [
        superadminEmail,
        await argon2.hash(SUPERADMIN_PASSWORD, { type: argon2.argon2id }),
      ],
    );

    app = await createTestApp();
    server = app.getHttpServer() as Server;

    const login = async (identifier: string, password: string) =>
      (
        (
          await request(server)
            .post('/auth/login')
            .send({ identifier, password })
        ).body as LoginResponse
      ).accessToken;
    tokenA = await login(tenantA.userEmail, tenantA.userPassword);
    tokenB = await login(tenantB.userEmail, tenantB.userPassword);
    tokenSuperadmin = await login(superadminEmail, SUPERADMIN_PASSWORD);
    expect(tokenA && tokenB && tokenSuperadmin).toBeTruthy();
  }, 30000);

  afterAll(async () => {
    await app.close();
    await destroyTestTenants(owner, [tenantA, tenantB]);
    await owner.query(`DELETE FROM iam.users WHERE email = $1`, [
      superadminEmail,
    ]);
    await owner.end();
  });

  describe('consultation template setting', () => {
    it('defaults to orl for every clinic', async () => {
      const res = await request(server)
        .get('/settings/consultation-template')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ template: 'orl' });
    });

    it('cannot be changed by a clinic admin', async () => {
      const res = await request(server)
        .patch(`/platform/tenants/${tenantA.id}/consultation-template`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ template: 'cirugia' });
      expect(res.status).toBe(403);
    });

    it('rejects an unknown template', async () => {
      const res = await request(server)
        .patch(`/platform/tenants/${tenantA.id}/consultation-template`)
        .set('Authorization', `Bearer ${tokenSuperadmin}`)
        .send({ template: 'dermatologia' });
      expect(res.status).toBe(400);
    });

    it('superadmin switches one clinic to cirugia without affecting another', async () => {
      const patch = await request(server)
        .patch(`/platform/tenants/${tenantA.id}/consultation-template`)
        .set('Authorization', `Bearer ${tokenSuperadmin}`)
        .send({ template: 'cirugia' });
      expect(patch.status).toBe(200);
      expect(patch.body).toEqual({ template: 'cirugia' });

      const a = await request(server)
        .get('/settings/consultation-template')
        .set('Authorization', `Bearer ${tokenA}`);
      const b = await request(server)
        .get('/settings/consultation-template')
        .set('Authorization', `Bearer ${tokenB}`);
      expect(a.body).toEqual({ template: 'cirugia' });
      expect(b.body).toEqual({ template: 'orl' });
    });
  });

  describe('new consulta fields', () => {
    let entryWithReport: ClinicalEntryResponse;

    it('stores Evolución / Informe (sanitized rich text) and Doctor que lo envía (trimmed)', async () => {
      const res = await request(server)
        .post(`/patients/${tenantA.patientId}/clinical-entries`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          chiefComplaint: '<p>Bulto cervical</p>',
          evolution: '<p>Crece en 2 meses</p><script>alert(1)</script>',
          report: '<p><strong>Se propone</strong> exéresis</p>',
          referringDoctor: '  Dr. Pérez Gómez  ',
        });
      expect(res.status).toBe(201);
      entryWithReport = res.body as ClinicalEntryResponse;
      expect(entryWithReport.evolution).toBe('<p>Crece en 2 meses</p>');
      expect(entryWithReport.report).toBe(
        '<p><strong>Se propone</strong> exéresis</p>',
      );
      expect(entryWithReport.referringDoctor).toBe('Dr. Pérez Gómez');
    });

    it('edits and clears the new fields with PATCH', async () => {
      const res = await request(server)
        .patch(`/clinical-entries/${entryWithReport.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ evolution: '', referringDoctor: 'Dr. Pérez Gómez' });
      expect(res.status).toBe(200);
      const body = res.body as ClinicalEntryResponse;
      expect(body.evolution).toBeNull();
      // Not sent -> untouched.
      expect(body.report).toBe('<p><strong>Se propone</strong> exéresis</p>');
    });

    it('suggests referring doctors already used in the same clinic only', async () => {
      const a = await request(server)
        .get('/clinical-entries/referring-doctors')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(a.status).toBe(200);
      expect(a.body).toContain('Dr. Pérez Gómez');

      const b = await request(server)
        .get('/clinical-entries/referring-doctors')
        .set('Authorization', `Bearer ${tokenB}`);
      expect(b.status).toBe(200);
      expect(b.body).not.toContain('Dr. Pérez Gómez');
    });

    it('prints the Informe PDF, and 404s for a consulta without one', async () => {
      const pdf = await request(server)
        .get(`/clinical-entries/${entryWithReport.id}/report-pdf`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect(pdf.headers['content-disposition']).toContain('informe-');

      const noReport = await request(server)
        .post(`/patients/${tenantA.patientId}/clinical-entries`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ chiefComplaint: 'Revisión' });
      const missing = await request(server)
        .get(
          `/clinical-entries/${(noReport.body as ClinicalEntryResponse).id}/report-pdf`,
        )
        .set('Authorization', `Bearer ${tokenA}`);
      expect(missing.status).toBe(404);
    });

    it('does not let another clinic print it', async () => {
      const res = await request(server)
        .get(`/clinical-entries/${entryWithReport.id}/report-pdf`)
        .set('Authorization', `Bearer ${tokenB}`);
      expect(res.status).toBe(404);
    });

    it('still renders the ficha PDF for a clinic on the cirugia template', async () => {
      const res = await request(server)
        .get(`/patients/${tenantA.patientId}/pdf`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });
  });

  describe('familiares a cargo (titular + parentesco)', () => {
    let holderId: string;
    let dependentId: string;
    let otherId: string;

    const createPatient = async (firstName: string) => {
      const res = await request(server)
        .post('/patients')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          firstName,
          lastName: 'Titularidad',
          dateOfBirth: '1980-01-01',
          phone: '600000999',
        });
      expect(res.status).toBe(201);
      return (res.body as { id: string }).id;
    };

    beforeAll(async () => {
      holderId = await createPatient('Titular');
      dependentId = await createPatient('Hija');
      otherId = await createPatient('Otro');
    });

    it('links a dependent to their holder and returns both sides on GET', async () => {
      const link = await request(server)
        .patch(`/patients/${dependentId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ holderPatientId: holderId, holderRelationship: 'hijo' });
      expect(link.status).toBe(200);

      const dep = await request(server)
        .get(`/patients/${dependentId}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(dep.body).toMatchObject({
        holderPatientId: holderId,
        holderRelationship: 'hijo',
        holder: { id: holderId, firstName: 'Titular' },
      });

      const holder = await request(server)
        .get(`/patients/${holderId}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(
        (holder.body as { dependents: { id: string }[] }).dependents.map(
          (d) => d.id,
        ),
      ).toEqual([dependentId]);

      const pdf = await request(server)
        .get(`/patients/${dependentId}/pdf`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(pdf.status).toBe(200);
    });

    it('requires a relationship when a holder is set', async () => {
      const res = await request(server)
        .patch(`/patients/${otherId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ holderPatientId: holderId });
      expect(res.status).toBe(400);
    });

    it('rejects the patient as their own holder', async () => {
      const res = await request(server)
        .patch(`/patients/${otherId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ holderPatientId: otherId, holderRelationship: 'otro' });
      expect(res.status).toBe(400);
    });

    it('rejects chains: a dependent cannot be a holder, and a holder cannot become a dependent', async () => {
      const dependentAsHolder = await request(server)
        .patch(`/patients/${otherId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ holderPatientId: dependentId, holderRelationship: 'hijo' });
      expect(dependentAsHolder.status).toBe(400);

      const holderAsDependent = await request(server)
        .patch(`/patients/${holderId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ holderPatientId: otherId, holderRelationship: 'conyuge' });
      expect(holderAsDependent.status).toBe(400);
    });

    it('rejects a holder from another clinic', async () => {
      const res = await request(server)
        .patch(`/patients/${otherId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          holderPatientId: tenantB.patientId,
          holderRelationship: 'otro',
        });
      expect(res.status).toBe(400);
    });

    it('removing the holder also removes the relationship', async () => {
      const res = await request(server)
        .patch(`/patients/${dependentId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ holderPatientId: null });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        holderPatientId: null,
        holderRelationship: null,
      });
    });
  });

  describe('patient gender and private insurance number', () => {
    it('saves, reads back and clears both fields', async () => {
      const set = await request(server)
        .patch(`/patients/${tenantA.patientId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ gender: 'mujer', insuranceNumber: ' ASI-0012345 ' });
      expect(set.status).toBe(200);
      expect(set.body).toMatchObject({
        gender: 'mujer',
        insuranceNumber: 'ASI-0012345',
      });

      const cleared = await request(server)
        .patch(`/patients/${tenantA.patientId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ gender: null, insuranceNumber: null });
      expect(cleared.status).toBe(200);
      const body = cleared.body as PatientResponse;
      expect(body.gender).toBeNull();
      expect(body.insuranceNumber).toBeNull();
    });

    it('rejects a gender other than hombre/mujer', async () => {
      const res = await request(server)
        .patch(`/patients/${tenantA.patientId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ gender: 'otro' });
      expect(res.status).toBe(400);
    });
  });
});
