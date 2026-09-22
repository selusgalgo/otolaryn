import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { InsuranceService } from '../insurance/insurance.service';
import { Patient } from '../patients/entities/patient.entity';
import { PaginatedResult, PatientsService } from '../patients/patients.service';
import { namesLookRelated } from '../shared/name-similarity.util';
import {
  plainTextToRichText,
  sanitizeRichText,
} from '../shared/rich-text.util';
import { TenancyContext } from '../tenancy/tenancy-context';
import type { ClinicalEntryImportRow } from './clinical-entries-csv.util';
import { CreateClinicalEntryDto } from './dto/create-clinical-entry.dto';
import { ClinicalEntry } from './entities/clinical-entry.entity';

const UNIQUE_VIOLATION = '23505';

// A bare "YYYY-MM-DD" (no time part — every consulta imported from
// consultas.xls is this shape, since FECHA never carries a real time of
// day) parsed with `new Date(...)` is treated as UTC midnight, which
// renders as 01:00/02:00 in Spain depending on DST — an oddly specific-
// looking time for something that's actually "no real time known".
// Appending a fixed 10:00 (a plausible mid-morning consult time, and
// parsed as local rather than UTC once it's a full date-time string)
// reads as the obviously-a-placeholder value it is instead of looking
// like real data. A value that already carries its own time (every
// manual "Nueva consulta" from the UI) passes through untouched.
function toVisitDate(visitDate: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(visitDate)
    ? new Date(`${visitDate}T10:00:00`)
    : new Date(visitDate);
}

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

    // Motivo/Exploración/Tratamiento are edited as rich text (Tiptap) —
    // sanitized here, not just trusted from the client.
    const entry = this.repo.create({
      tenantId: this.tenancyContext.tenantId,
      patientId,
      authorUserId,
      chiefComplaint: sanitizeRichText(dto.chiefComplaint),
      examinationFindings: dto.examinationFindings
        ? sanitizeRichText(dto.examinationFindings)
        : null,
      diagnosis: dto.diagnosis ?? null,
      treatment: dto.treatment ? sanitizeRichText(dto.treatment) : null,
      followUpNotes: dto.followUpNotes ?? null,
      visitDate: dto.visitDate ? toVisitDate(dto.visitDate) : new Date(),
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
    // consultas.xls has many rows per patient (one per visit) — without
    // this, a patient with a dozen consultas triggers a dozen identical
    // lookups by the same NUMHISTORIA in one request. Caches misses too
    // (null), same reasoning: a bad legacyId's answer can't change
    // mid-request either.
    const patientCache = new Map<string, Patient | null>();
    // Same idea as the Pacientes importer's own cache: the same handful
    // of aseguradora names repeat across thousands of rows.
    const insuranceCache = new Map<string, string>();

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
      let patient = patientCache.get(row.patientLegacyId);
      if (patient === undefined) {
        patient = await this.patients.findByLegacyId(row.patientLegacyId);
        patientCache.set(row.patientLegacyId, patient);
      }
      if (!patient) {
        skipped.push({
          row: rowNumber,
          reason: `No existe ningún paciente con el nº de historia "${row.patientLegacyId}" — impórtalo primero desde Pacientes`,
        });
        continue;
      }

      // The legacy source itself isn't reliable: the same NUMHISTORIA can
      // point to a different person in pacientes.xls than in
      // consultas.xls (the legacy system reused/reassigned historia
      // numbers over the years — confirmed against a real sample of both
      // files). legacy_id resolution above is exact and correct; this is
      // a sanity check on top of it, not a replacement — if the row's own
      // name looks nothing like the patient that legacy_id resolved to,
      // skip it for manual review instead of silently attaching it to the
      // wrong person.
      if (row.patientFirstName || row.patientLastName) {
        const rowName = [row.patientFirstName, row.patientLastName]
          .filter(Boolean)
          .join(' ');
        const patientName = `${patient.firstName} ${patient.lastName}`;
        if (!namesLookRelated(rowName, patientName)) {
          skipped.push({
            row: rowNumber,
            reason: `El nombre "${rowName}" no coincide con el paciente "${patientName}" (nº de historia "${row.patientLegacyId}") — revisa el nº de historia`,
          });
          continue;
        }
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
      let insuranceEntityId: string | undefined;
      if (row.insuranceEntityName) {
        const cacheKey = row.insuranceEntityName.trim().toLowerCase();
        insuranceEntityId = insuranceCache.get(cacheKey);
        if (!insuranceEntityId) {
          insuranceEntityId = await this.insurance.findOrCreateByName(
            row.insuranceEntityName,
          );
          insuranceCache.set(cacheKey, insuranceEntityId);
        }
      }

      // The whole request already runs inside one transaction
      // (TenantContextInterceptor) — without a SAVEPOINT per row, one
      // row's unique-constraint violation (a re-imported legacy_id)
      // aborts that shared transaction at the Postgres level, and every
      // row after it fails too even though nothing is wrong with them.
      await this.repo.query('SAVEPOINT row_import');
      try {
        // consultas.xls cells are plain text, not the HTML the Motivo/
        // Exploración/Tratamiento editors produce — converted here
        // (newlines -> <br>) same as the Pacientes importer's own Notas.
        const entry = this.repo.create({
          tenantId: this.tenancyContext.tenantId,
          patientId: patient.id,
          authorUserId,
          chiefComplaint: plainTextToRichText(row.chiefComplaint),
          examinationFindings: row.examinationFindings
            ? plainTextToRichText(row.examinationFindings)
            : null,
          diagnosis: null,
          treatment: row.treatment ? plainTextToRichText(row.treatment) : null,
          followUpNotes: null,
          visitDate: row.visitDate ? toVisitDate(row.visitDate) : new Date(),
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
