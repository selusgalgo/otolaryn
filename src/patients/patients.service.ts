import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryFailedError, SelectQueryBuilder } from 'typeorm';
import { PatientAntecedente } from '../antecedentes/entities/patient-antecedente.entity';
import type { CurrentUserPayload } from '../iam/current-user.decorator';
import { InsuranceService } from '../insurance/insurance.service';
import { TenancyContext } from '../tenancy/tenancy-context';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { Patient } from './entities/patient.entity';
import type { ImportRow } from './patients-csv.util';

const UNIQUE_VIOLATION = '23505';

export interface ImportPatientsResult {
  totalRows: number;
  created: number;
  skipped: { row: number; reason: string }[];
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BulkDeleteResult {
  deleted: number;
  skipped: { id: string; reason: string }[];
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly tenancyContext: TenancyContext,
    private readonly insurance: InsuranceService,
  ) {}

  private get repo() {
    // No explicit WHERE tenant_id anywhere in this service on purpose: RLS
    // is what must filter this, not application code remembering to.
    return this.tenancyContext.manager.getRepository(Patient);
  }

  // "Their" patients aren't a stored relation — a profesional's visibility
  // is derived from having at least one appointment or clinical entry with
  // that patient. The subqueries run on the same RLS-scoped connection as
  // everything else here, so tenant isolation still comes from RLS, not
  // from this filter (this is an additional narrowing on top of it).
  private restrictToOwnPatients(
    qb: SelectQueryBuilder<Patient>,
    user: CurrentUserPayload,
  ): void {
    if (user.role !== 'profesional') {
      return;
    }
    qb.andWhere(
      `(EXISTS (
         SELECT 1 FROM appointments ap
         WHERE ap.patient_id = p.id AND ap.practitioner_id = :ownerId
       ) OR EXISTS (
         SELECT 1 FROM clinical_entries ce
         WHERE ce.patient_id = p.id AND ce.author_user_id = :ownerId
       ))`,
      { ownerId: user.userId },
    );
  }

  async findAll(
    user: CurrentUserPayload,
    page: number,
    pageSize: number,
    search?: string,
  ): Promise<PaginatedResult<Patient>> {
    const qb = this.repo.createQueryBuilder('p').orderBy('p.createdAt', 'DESC');
    this.restrictToOwnPatients(qb, user);

    if (search) {
      qb.andWhere(
        '(p.firstName ILIKE :search OR p.lastName ILIKE :search OR p.documentId ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.skip((page - 1) * pageSize).take(pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pageSize };
  }

  // Same visibility rule as findAll, unpaginated — exporting is "give me
  // everything I can already see", not a separate permission.
  async findAllForExport(
    user: CurrentUserPayload,
    search?: string,
  ): Promise<Patient[]> {
    const qb = this.repo.createQueryBuilder('p').orderBy('p.createdAt', 'DESC');
    this.restrictToOwnPatients(qb, user);

    if (search) {
      qb.andWhere(
        '(p.firstName ILIKE :search OR p.lastName ILIKE :search OR p.documentId ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    return qb.getMany();
  }

  async findOne(id: string, user?: CurrentUserPayload): Promise<Patient> {
    const qb = this.repo.createQueryBuilder('p').where('p.id = :id', { id });
    if (user) {
      this.restrictToOwnPatients(qb, user);
    }
    const patient = await qb.getOne();
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    return patient;
  }

  // Used by the Consultas importer to resolve NUMHISTORIA -> patient,
  // relating rows by legacy_id rather than by name (the whole reason that
  // importer exists instead of matching on "Nombre Apellidos", which is
  // ambiguous). null (not a thrown 404) on no match — the caller reports
  // that specific row as skipped instead of failing the whole import.
  async findByLegacyId(legacyId: string): Promise<Patient | null> {
    return this.repo.findOne({ where: { legacyId } });
  }

  async create(dto: CreatePatientDto): Promise<Patient> {
    const patient = this.repo.create({
      ...dto,
      tenantId: this.tenancyContext.tenantId,
    });
    try {
      return await this.repo.save(patient);
    } catch (err) {
      throw this.mapWriteError(err);
    }
  }

  // Each row runs through the exact same CreatePatientDto validation as a
  // single POST /patients (plainToInstance + validate, not the global
  // ValidationPipe — this isn't a request body) — a bad row is skipped and
  // reported, it never aborts the whole file. Sequential, not batched: a
  // spreadsheet-sized import (dozens to low hundreds of rows) doesn't need
  // the complexity of a bulk insert, and sequential inserts are what let a
  // duplicate documentId within the same file surface as a normal
  // "already exists" skip on the second occurrence instead of a DB error.
  async bulkImport(rows: ImportRow[]): Promise<ImportPatientsResult> {
    const skipped: { row: number; reason: string }[] = [];
    let created = 0;
    // A real legacy file repeats the same handful of aseguradora names
    // across thousands of rows — resolving each occurrence with its own
    // DB round trip is most of a large import's total time for no reason,
    // since the answer for a given name can't change mid-request. Keyed
    // lower-cased, matching findOrCreateByName's own case-insensitive
    // lookup, so "ASISA" and "Asisa" share one cache entry.
    const insuranceCache = new Map<string, string>();

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 1;
      const { insuranceEntityName, antecedentes, ...fields } = rows[i];

      // Resolved (and created if new) before validation, outside any
      // SAVEPOINT — an aseguradora added to the catalog this way is real
      // catalog data, not tied to whether this particular row ends up
      // skipped for an unrelated reason.
      let insuranceEntityId: string | undefined;
      if (insuranceEntityName) {
        const cacheKey = insuranceEntityName.trim().toLowerCase();
        insuranceEntityId = insuranceCache.get(cacheKey);
        if (!insuranceEntityId) {
          insuranceEntityId =
            await this.insurance.findOrCreateByName(insuranceEntityName);
          insuranceCache.set(cacheKey, insuranceEntityId);
        }
      }

      const dto = plainToInstance(CreatePatientDto, {
        ...fields,
        ...(insuranceEntityId ? { insuranceEntityId } : {}),
      });
      const errors = await validate(dto);
      if (errors.length > 0) {
        const reason = errors
          .flatMap((e) => Object.values(e.constraints ?? {}))
          .join('; ');
        skipped.push({ row: rowNumber, reason });
        continue;
      }

      // The whole request already runs inside one transaction
      // (TenantContextInterceptor) — without a SAVEPOINT per row, one
      // row's unique-constraint violation aborts that shared transaction
      // at the Postgres level, and every row after it fails with
      // "current transaction is aborted" (25P02) even though nothing is
      // wrong with them. Rolling back to the savepoint instead of the
      // whole transaction is what lets the loop keep going.
      await this.repo.query('SAVEPOINT row_import');
      try {
        const patient = await this.create(dto);
        if (antecedentes && antecedentes.length > 0) {
          await this.repo.manager.insert(
            PatientAntecedente,
            antecedentes.map((a) => ({
              tenantId: this.tenancyContext.tenantId,
              patientId: patient.id,
              antecedenteTypeId: a.antecedenteTypeId,
              detalle: a.detalle,
            })),
          );
        }
        await this.repo.query('RELEASE SAVEPOINT row_import');
        created++;
      } catch (err) {
        await this.repo.query('ROLLBACK TO SAVEPOINT row_import');
        if (err instanceof ConflictException) {
          skipped.push({
            row: rowNumber,
            reason: dto.legacyId
              ? `Ya existe un paciente con el nº de historia "${dto.legacyId}"`
              : `Ya existe un paciente con el documento "${dto.documentId}"`,
          });
        } else {
          throw err;
        }
      }
    }

    return { totalRows: rows.length, created, skipped };
  }

  async update(id: string, dto: UpdatePatientDto): Promise<Patient> {
    const patient = await this.findOne(id);
    this.repo.merge(patient, dto);
    try {
      return await this.repo.save(patient);
    } catch (err) {
      throw this.mapWriteError(err);
    }
  }

  async softDelete(id: string, user: CurrentUserPayload): Promise<void> {
    await this.findOne(id, user);
    await this.repo.softDelete(id);
  }

  // Backs the patients list's bulk "Dar de baja" — reuses softDelete's own
  // visibility check (findOne, RLS + restrictToOwnPatients) per id instead
  // of a single multi-row UPDATE, so an id a profesional can't see (or
  // that's already gone) is reported back as skipped rather than the
  // whole selection failing or silently affecting fewer rows than
  // expected.
  async bulkSoftDelete(
    ids: string[],
    user: CurrentUserPayload,
  ): Promise<BulkDeleteResult> {
    const skipped: { id: string; reason: string }[] = [];
    let deleted = 0;

    for (const id of ids) {
      try {
        await this.softDelete(id, user);
        deleted++;
      } catch (err) {
        if (err instanceof NotFoundException) {
          skipped.push({ id, reason: 'Paciente no encontrado' });
        } else {
          throw err;
        }
      }
    }

    return { deleted, skipped };
  }

  private mapWriteError(err: unknown): Error {
    if (
      err instanceof QueryFailedError &&
      (err as { code?: string }).code === UNIQUE_VIOLATION
    ) {
      // Two different unique indexes can fire here (document_id, and now
      // tenant_id+legacy_id from PatientsLegacyId) — telling them apart
      // matters for the legacy import specifically: re-running the same
      // file should report "ya importado" per row, not the misleading
      // "documento duplicado" every other import conflict uses.
      const constraint = (err as { constraint?: string }).constraint;
      if (constraint === 'patients_tenant_legacy_id_idx') {
        return new ConflictException(
          'A patient with this legacy id has already been imported',
        );
      }
      return new ConflictException(
        'A patient with this document ID already exists',
      );
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
