import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { InsuranceService } from '../insurance/insurance.service';
import { PaginatedResult, PatientsService } from '../patients/patients.service';
import { TenancyContext } from '../tenancy/tenancy-context';
import type { ClinicalEntryImportRow } from './clinical-entries-csv.util';
import { CreateClinicalEntryDto } from './dto/create-clinical-entry.dto';
import { ClinicalEntry } from './entities/clinical-entry.entity';

const UNIQUE_VIOLATION = '23505';

export interface ImportClinicalEntriesResult {
  totalRows: number;
  created: number;
  skipped: { row: number; reason: string }[];
}

@Injectable()
export class ClinicalEntriesService {
  constructor(
    private readonly tenancyContext: TenancyContext,
    private readonly patients: PatientsService,
    private readonly insurance: InsuranceService,
  ) {}

  private get repo() {
    // No explicit WHERE tenant_id here on purpose: RLS is what must filter
    // this, not application code remembering to.
    return this.tenancyContext.manager.getRepository(ClinicalEntry);
  }

  async create(
    patientId: string,
    authorUserId: string,
    dto: CreateClinicalEntryDto,
  ): Promise<ClinicalEntry> {
    // Throws NotFoundException if the patient doesn't exist or belongs to
    // another tenant (RLS hides it either way) — this is also what makes
    // the FK on (patient_id, tenant_id) succeed below.
    await this.patients.findOne(patientId);

    const entry = this.repo.create({
      tenantId: this.tenancyContext.tenantId,
      patientId,
      authorUserId,
      chiefComplaint: dto.chiefComplaint,
      examinationFindings: dto.examinationFindings ?? null,
      diagnosis: dto.diagnosis ?? null,
      treatment: dto.treatment ?? null,
      followUpNotes: dto.followUpNotes ?? null,
      visitDate: dto.visitDate ? new Date(dto.visitDate) : new Date(),
    });
    return this.repo.save(entry);
  }

  // Imports consultas.xls-shaped rows, relating each to a patient by
  // legacy_id (NUMHISTORIA) instead of by name — the same "never match on
  // a name, it's ambiguous" rule the Pacientes importer follows for its
  // own legacy_id. A row is skipped (never a hard failure for the whole
  // batch) whenever something it needs doesn't resolve: no motivo, no
  // matching patient, or no doctor mapped to a real user — author_user_id
  // is NOT NULL on clinical_entries, so a consulta with nobody to
  // attribute it to genuinely can't be created.
  //
  // legacyId on the created row is the 1-based row index within this
  // file (see ClinicalEntry entity/migration comment) — re-running the
  // same file is idempotent because of it: a row already imported hits
  // the (tenant_id, legacy_id) unique index and gets reported as skipped
  // instead of duplicated.
  async bulkImport(
    rows: ClinicalEntryImportRow[],
    doctorMapping: Record<string, string>,
  ): Promise<ImportClinicalEntriesResult> {
    const skipped: { row: number; reason: string }[] = [];
    let created = 0;

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 1;
      const row = rows[i];

      if (!row.chiefComplaint) {
        skipped.push({
          row: rowNumber,
          reason: 'Falta el motivo de la consulta',
        });
        continue;
      }
      if (!row.patientLegacyId) {
        skipped.push({
          row: rowNumber,
          reason: 'Falta el nº de historia del paciente',
        });
        continue;
      }
      const patient = await this.patients.findByLegacyId(row.patientLegacyId);
      if (!patient) {
        skipped.push({
          row: rowNumber,
          reason: `No existe ningún paciente con el nº de historia "${row.patientLegacyId}" — impórtalo primero desde Pacientes`,
        });
        continue;
      }

      const authorUserId = row.doctorName
        ? doctorMapping[row.doctorName]
        : undefined;
      if (!authorUserId) {
        skipped.push({
          row: rowNumber,
          reason: row.doctorName
            ? `El médico "${row.doctorName}" no está asignado a ningún profesional`
            : 'Falta el médico de la consulta',
        });
        continue;
      }

      // Resolved (and created if new) before the SAVEPOINT below, same as
      // the Pacientes importer — an aseguradora added to the catalog this
      // way is real catalog data, not tied to whether this row ends up
      // skipped for an unrelated reason.
      const insuranceEntityId = row.insuranceEntityName
        ? await this.insurance.findOrCreateByName(row.insuranceEntityName)
        : undefined;

      // The whole request already runs inside one transaction
      // (TenantContextInterceptor) — without a SAVEPOINT per row, one
      // row's unique-constraint violation (a re-imported legacy_id)
      // aborts that shared transaction at the Postgres level, and every
      // row after it fails too even though nothing is wrong with them.
      await this.repo.query('SAVEPOINT row_import');
      try {
        const entry = this.repo.create({
          tenantId: this.tenancyContext.tenantId,
          patientId: patient.id,
          authorUserId,
          chiefComplaint: row.chiefComplaint,
          examinationFindings: row.examinationFindings ?? null,
          diagnosis: null,
          treatment: row.treatment ?? null,
          followUpNotes: null,
          visitDate: row.visitDate ? new Date(row.visitDate) : new Date(),
          insuranceEntityId: insuranceEntityId ?? null,
          legacyId: String(rowNumber),
        });
        await this.repo.save(entry);
        await this.repo.query('RELEASE SAVEPOINT row_import');
        created++;
      } catch (err) {
        await this.repo.query('ROLLBACK TO SAVEPOINT row_import');
        if (
          err instanceof QueryFailedError &&
          (err as { code?: string }).code === UNIQUE_VIOLATION
        ) {
          skipped.push({
            row: rowNumber,
            reason: 'Esta fila ya se había importado antes',
          });
        } else {
          throw err;
        }
      }
    }

    return { totalRows: rows.length, created, skipped };
  }

  async findAllForPatient(
    patientId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<ClinicalEntry>> {
    await this.patients.findOne(patientId);

    const [data, total] = await this.repo.findAndCount({
      where: { patientId },
      order: { visitDate: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { data, total, page, pageSize };
  }

  async findOne(id: string): Promise<ClinicalEntry> {
    const entry = await this.repo.findOne({ where: { id } });
    if (!entry) {
      throw new NotFoundException('Clinical entry not found');
    }
    return entry;
  }
}
