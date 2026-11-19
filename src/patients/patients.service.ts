import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Brackets, QueryFailedError, SelectQueryBuilder } from 'typeorm';
import { AntecedenteType } from '../antecedentes/entities/antecedente-type.entity';
import { PatientAntecedente } from '../antecedentes/entities/patient-antecedente.entity';
import { ClinicalEntry } from '../clinical-entries/entities/clinical-entry.entity';
import type {
  ImportJobProgress,
  RowOutcome,
} from '../import-jobs/import-jobs.service';
import { ImportJobsService } from '../import-jobs/import-jobs.service';
import { InsuranceService } from '../insurance/insurance.service';
import {
  plainTextToRichText,
  sanitizeRichText,
} from '../shared/rich-text.util';
import { TenancyContext } from '../tenancy/tenancy-context';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ImportPatientDto } from './dto/import-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { type HolderRelationship, Patient } from './entities/patient.entity';

export interface HolderSummary {
  id: string;
  firstName: string;
  lastName: string;
  documentId: string | null;
  legacyId: string | null;
}
import type { ImportRow, UpdateRow } from './patients-csv.util';
import type {
  PatientSortBy,
  SortDirection,
} from './dto/list-patients-query.dto';

const UNIQUE_VIOLATION = '23505';

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
    private readonly importJobs: ImportJobsService,
  ) {}

  private get repo() {
    // No explicit WHERE tenant_id anywhere in this service on purpose: RLS
    // is what must filter this, not application code remembering to.
    return this.tenancyContext.manager.getRepository(Patient);
  }

  // Splits the query into words and requires each one to match *somewhere*
  // (name, documento, Nº de historia, or teléfono) rather than treating the whole
  // string as one substring against a single field — "Hector Sanchez"
  // otherwise matches neither "HECTOR" alone nor "SANCHEZ CARDONA" alone,
  // even though it's plainly this patient's name split across two fields.
  // legacyId wasn't searched here at all before, so a real Nº de historia
  // (the number staff actually have on hand from the old paper files)
  // silently found nothing.
  private applySearch(qb: SelectQueryBuilder<Patient>, search: string): void {
    const terms = search.trim().split(/\s+/).filter(Boolean);
    terms.forEach((term, i) => {
      const param = `search${i}`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where(`p.firstName ILIKE :${param}`, { [param]: `%${term}%` })
            .orWhere(`p.lastName ILIKE :${param}`, { [param]: `%${term}%` })
            .orWhere(`p.documentId ILIKE :${param}`, { [param]: `%${term}%` })
            .orWhere(`p.legacyId ILIKE :${param}`, { [param]: `%${term}%` })
            .orWhere(`p.phone ILIKE :${param}`, { [param]: `%${term}%` })
            .orWhere(`p.phone2 ILIKE :${param}`, { [param]: `%${term}%` });
          // Teléfono por dígitos: se escribe como "600-123-456" y se guarda
          // como "+34 600 123 456"; comparando solo los dígitos los dos
          // formatos se encuentran. Solo para términos que parecen un teléfono
          // (sin letras, 4 o más dígitos): un documento como "IMP-XLSX-001" o
          // un Nº de historia corto contienen dígitos sueltos que, si no, se
          // colarían en teléfonos de otros pacientes.
          const digits = term.replace(/\D/g, '');
          if (digits.length >= 4 && /^[+\d\s().-]+$/.test(term)) {
            const digitsParam = `${param}Digits`;
            sub
              .orWhere(
                `regexp_replace(p.phone, '[^0-9]', '', 'g') LIKE :${digitsParam}`,
                { [digitsParam]: `%${digits}%` },
              )
              .orWhere(
                `regexp_replace(COALESCE(p.phone2, ''), '[^0-9]', '', 'g') LIKE :${digitsParam}`,
                { [digitsParam]: `%${digits}%` },
              );
          }
        }),
      );
    });
  }

  // Every role sees every patient in the tenant — a profesional isn't
  // limited to patients they already have an appointment or clinical
  // entry with (that restriction existed here before and was removed: a
  // doctor covering for a colleague, or just checking a chart ahead of a
  // first visit, needs to find anyone in the clinic). Appointment
  // visibility is the separate thing that stays scoped to "their own" —
  // see AppointmentsService.findAll.
  async findAll(
    page: number,
    pageSize: number,
    search?: string,
    sortBy?: PatientSortBy,
    sortDir: SortDirection = 'asc',
  ): Promise<PaginatedResult<Patient>> {
    const qb = this.repo.createQueryBuilder('p');
    const direction = sortDir.toUpperCase() as 'ASC' | 'DESC';
    if (sortBy === 'name') {
      qb.orderBy('p.firstName', direction).addOrderBy('p.lastName', direction);
    } else if (sortBy === 'dateOfBirth') {
      // Los pacientes sin fecha (importados de un legado) van siempre al
      // final, ascendente o descendente — por defecto Postgres los pondría
      // los primeros al ordenar de más joven a más mayor.
      qb.orderBy('p.dateOfBirth', direction, 'NULLS LAST');
    } else {
      qb.orderBy('p.createdAt', 'DESC');
    }

    if (search) {
      this.applySearch(qb, search);
    }

    qb.skip((page - 1) * pageSize).take(pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pageSize };
  }

  // Same visibility rule as findAll, unpaginated — exporting is "give me
  // everything I can already see", not a separate permission.
  async findAllForExport(search?: string): Promise<Patient[]> {
    const qb = this.repo.createQueryBuilder('p').orderBy('p.createdAt', 'DESC');

    if (search) {
      this.applySearch(qb, search);
    }

    return qb.getMany();
  }

  async findOne(id: string): Promise<Patient> {
    const patient = await this.repo.findOne({ where: { id } });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }
    return patient;
  }

  // Backs GET /patients/:id specifically — "fecha de la primera consulta"
  // used to be a manually-entered column, but that duplicated (and could
  // drift from) the real answer already sitting in clinical_entries once
  // the Consultas importer exists, so it's derived fresh on every read
  // instead. Kept out of the plain findOne() above: every other caller
  // (create/update/archive/the Consultas and Antecedentes importers) only
  // needs the real Patient entity to merge/save or check existence, not
  // this derived value tacked onto it.
  //
  // firstConsultationOverride (see entity/migration comment) covers the
  // gap that derivation alone can't: a patient whose real first visit has
  // no clinical_entries row at all. The earlier of the two wins rather
  // than the override unconditionally winning — once a real consulta is
  // recorded with an even earlier date, that becomes the answer again on
  // its own, no one has to remember to clear the override.
  async findOneWithFirstConsultationDate(id: string): Promise<
    Patient & {
      firstConsultationDate: string | null;
    } & Awaited<ReturnType<PatientsService['findHolderLinks']>>
  > {
    const patient = await this.findOne(id);
    const links = await this.findHolderLinks(patient);
    const row = await this.tenancyContext.manager
      .getRepository(ClinicalEntry)
      .createQueryBuilder('ce')
      .select('MIN(ce.visit_date)', 'min')
      .where('ce.patient_id = :id', { id })
      // Un borrador no es una consulta realizada: no adelanta la "primera
      // consulta" del paciente.
      .andWhere("ce.status = 'firmada'")
      .getRawOne<{ min: Date | null }>();
    const computed = row?.min ? row.min.toISOString().slice(0, 10) : null;
    const override = patient.firstConsultationOverride;
    const firstConsultationDate =
      computed && override
        ? computed < override
          ? computed
          : override
        : (computed ?? override);
    return { ...patient, firstConsultationDate, ...links };
  }

  // Used by the Consultas importer to resolve NUMHISTORIA -> patient,
  // relating rows by legacy_id rather than by name (the whole reason that
  // importer exists instead of matching on "Nombre Apellidos", which is
  // ambiguous). null (not a thrown 404) on no match — the caller reports
  // that specific row as skipped instead of failing the whole import.
  async findByLegacyId(legacyId: string): Promise<Patient | null> {
    return this.repo.findOne({ where: { legacyId } });
  }

  // ImportPatientDto solo lo usa el importador: es CreatePatientDto con
  // fecha de nacimiento y teléfono opcionales (quedan NULL si el fichero no
  // los trae). El alta manual sigue entrando con CreatePatientDto.
  async create(
    dto: CreatePatientDto | ImportPatientDto,
    creationSource: 'manual' | 'import' | 'whatsapp' = 'manual',
  ): Promise<Patient> {
    // Número de historia (24/09/2026, a petición del usuario): antes solo
    // lo traían los pacientes del importador del legado (NUMHISTORIA) —
    // uno creado desde el formulario normal se quedaba con legacy_id NULL
    // para siempre, justo el dato que el personal usa para relacionar todo
    // (ver PatientNumberCounters1734700000000). Si el DTO ya trae uno
    // explícito (el importador, cuando esa fila del legado sí tenía
    // NUMHISTORIA) se respeta tal cual; si no, se asigna el siguiente de la
    // secuencia del tenant — cubre tanto el alta normal como una fila
    // importada sin NUMHISTORIA en el legado.
    await this.assertHolder(null, dto);
    const legacyId = dto.legacyId ?? (await this.assignNextPatientNumber());
    const patient = this.repo.create({
      ...dto,
      creationSource,
      legacyId,
      // Notas is edited as rich text (Tiptap) — sanitized here, not just
      // trusted from the client, so a crafted request can't smuggle
      // anything past the editor's own allowlist.
      ...(dto.notes ? { notes: sanitizeRichText(dto.notes) } : {}),
      tenantId: this.tenancyContext.tenantId,
    });
    try {
      return await this.repo.save(patient);
    } catch (err) {
      throw this.mapWriteError(err);
    }
  }

  // Reconcile with existing histories on every allocation: imports with an
  // explicit legacyId do not advance the counter. Include archived patients
  // so their histories are not reused, and ignore nonnumeric legacy IDs.
  // The atomic upsert also preserves a counter already ahead of MAX and
  // serializes simultaneous automatic allocations for the same tenant.
  private async assignNextPatientNumber(): Promise<string> {
    const rows = await this.tenancyContext.manager.query<
      { assigned: number }[]
    >(
      `
        INSERT INTO patient_number_counters (tenant_id, next_number)
        SELECT $1, COALESCE(MAX(legacy_id::numeric), 0) + 2
        FROM public.patients
        WHERE tenant_id = $1 AND legacy_id ~ '^[0-9]+$'
        ON CONFLICT (tenant_id)
          DO UPDATE SET next_number = GREATEST(
            patient_number_counters.next_number + 1,
            EXCLUDED.next_number
          )
        RETURNING next_number - 1 AS assigned
      `,
      [this.tenancyContext.tenantId],
    );
    return String(rows[0].assigned);
  }

  // Each row runs through the exact same CreatePatientDto validation as a
  // single POST /patients (plainToInstance + validate, not the global
  // ValidationPipe — this isn't a request body) — a bad row is skipped and
  // reported, it never aborts the whole file. Sequential, not batched: a
  // spreadsheet-sized import (dozens to low hundreds of rows) doesn't need
  // the complexity of a bulk insert, and sequential inserts are what let a
  // duplicate documentId within the same file surface as a normal
  // "already exists" skip on the second occurrence instead of a DB error.
  // Kicks off a batched import job instead of importing synchronously —
  // see ImportJobsService for why. The caller (PatientsController) polls
  // continueBulkImportJob repeatedly until the job reports 'completed'.
  async startBulkImportJob(rows: ImportRow[]): Promise<ImportJobProgress> {
    return this.importJobs.create('patients', rows);
  }

  async continueBulkImportJob(
    jobId: string,
    batchSize: number,
  ): Promise<ImportJobProgress> {
    // Scoped to this one batch/request, not the whole job - a repeated
    // aseguradora name across batches costs one extra lookup per batch
    // instead of per file, a fine trade for not needing cross-request
    // state.
    const insuranceCache = new Map<string, string>();
    return this.importJobs.advance<ImportRow>(
      jobId,
      'patients',
      batchSize,
      (row, rowNumber) => this.importRow(row, rowNumber, insuranceCache),
    );
  }

  // Same per-row logic the old synchronous bulkImport ran inline, now
  // just one row at a time on behalf of ImportJobsService.advance().
  private async importRow(
    row: ImportRow,
    rowNumber: number,
    insuranceCache: Map<string, string>,
  ): Promise<RowOutcome> {
    const { insuranceEntityName, antecedentes, ...fields } = row;

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

    // Nombre y apellidos vacíos a la vez: el paciente no se podría buscar
    // ni citar, así que la fila se omite — pero con un motivo que diga
    // exactamente eso, no la lista de restricciones de class-validator.
    if (!fields.firstName?.trim() && !fields.lastName?.trim()) {
      return { created: false, reason: 'Nombre y apellidos vacíos' };
    }

    const dto = plainToInstance(ImportPatientDto, {
      ...fields,
      // A legacy file's Notas cell is plain text, not the HTML the Notas
      // editor produces — converted here (newlines -> <br>) so create()'s
      // own sanitizeRichText treats it as already-rich-text instead of
      // escaping the whole thing as literal characters.
      ...(fields.notes ? { notes: plainTextToRichText(fields.notes) } : {}),
      ...(insuranceEntityId ? { insuranceEntityId } : {}),
    });
    const errors = await validate(dto);
    if (errors.length > 0) {
      const reason = errors
        .flatMap((e) => Object.values(e.constraints ?? {}))
        .join('; ');
      return { created: false, reason };
    }

    // Each batch already runs inside its own transaction
    // (TenantContextInterceptor, one per HTTP request) — without a
    // SAVEPOINT per row, one row's unique-constraint violation aborts
    // that transaction at the Postgres level, and every row after it in
    // the same batch fails with "current transaction is aborted" (25P02)
    // even though nothing is wrong with them. Rolling back to the
    // savepoint instead of the whole transaction is what lets the loop
    // keep going.
    await this.repo.query('SAVEPOINT row_import');
    try {
      const patient = await this.create(dto, 'import');
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
      return { created: true };
    } catch (err) {
      await this.repo.query('ROLLBACK TO SAVEPOINT row_import');
      if (err instanceof ConflictException) {
        return {
          created: false,
          reason: dto.legacyId
            ? `Ya existe un paciente con el nº de historia "${dto.legacyId}"`
            : `Ya existe un paciente con el documento "${dto.documentId}"`,
        };
      }
      throw err;
    }
  }

  // Separate job type from 'patients' on purpose — see the big comment on
  // patients-csv.util's update-mode section. Re-importing a corrected
  // legacy export onto patients that already exist, touching only
  // firstConsultationOverride, notes (Historia clínica) and antecedentes,
  // never the rest of the record.
  async startBulkUpdateJob(rows: UpdateRow[]): Promise<ImportJobProgress> {
    return this.importJobs.create('patients-update', rows);
  }

  async continueBulkUpdateJob(
    jobId: string,
    batchSize: number,
  ): Promise<ImportJobProgress> {
    // Loaded once per batch (not per row) — same reasoning as the
    // insurance/patient caches elsewhere in this file. personalIdByName is
    // what lets each row clean up the "also marked personal by mistake"
    // duplicate the old import-mapping bug left behind, without a DB round
    // trip per antecedente per row.
    const types = await this.tenancyContext.manager
      .getRepository(AntecedenteType)
      .find();
    const typeById = new Map(types.map((t) => [t.id, t]));
    const personalIdByName = new Map(
      types
        .filter((t) => t.category === 'personal')
        .map((t) => [t.name.trim().toLowerCase(), t.id]),
    );
    // Same per-batch aseguradora cache as continueBulkImportJob.
    const insuranceCache = new Map<string, string>();
    return this.importJobs.advance<UpdateRow>(
      jobId,
      'patients-update',
      batchSize,
      (row, rowNumber) =>
        this.updateRow(
          row,
          rowNumber,
          typeById,
          personalIdByName,
          insuranceCache,
        ),
    );
  }

  // Overwrites the patient's plain fields with the row's non-empty cells
  // (see the update-mode comment in patients-csv.util). Returns whether
  // anything actually changed, or the reason the row can't be applied —
  // validation and a clashing documentId are per-row skips, never a failure
  // of the whole job. Antecedentes/notes/Primera consulta stay with the
  // code in updateRow.
  private async applyPatientFields(
    patient: Patient,
    row: UpdateRow,
    insuranceCache: Map<string, string>,
  ): Promise<{ changed: boolean; note?: string } | { reason: string }> {
    const incoming: Partial<Record<string, string>> = { ...row.fields };

    // Resolved (and created if new) before validation, outside the
    // SAVEPOINT — same reasoning as importRow.
    if (row.insuranceEntityName) {
      const cacheKey = row.insuranceEntityName.trim().toLowerCase();
      let insuranceEntityId = insuranceCache.get(cacheKey);
      if (!insuranceEntityId) {
        insuranceEntityId = await this.insurance.findOrCreateByName(
          row.insuranceEntityName,
        );
        insuranceCache.set(cacheKey, insuranceEntityId);
      }
      incoming.insuranceEntityId = insuranceEntityId;
    }
    if (Object.keys(incoming).length === 0) return { changed: false };

    // Same validation a PATCH /patients/:id goes through.
    const dto = plainToInstance(UpdatePatientDto, incoming);
    const errors = await validate(dto, { skipMissingProperties: true });
    if (errors.length > 0) {
      return {
        reason: errors
          .flatMap((e) => Object.values(e.constraints ?? {}))
          .join('; '),
      };
    }

    const current = patient as unknown as Record<string, string | null>;
    const changes: Record<string, string> = {};
    for (const [key, value] of Object.entries(dto as Record<string, string>)) {
      if (value !== undefined && current[key] !== value) changes[key] = value;
    }
    if (Object.keys(changes).length === 0) return { changed: false };

    const previousDocumentId = patient.documentId;
    this.repo.merge(patient, changes);
    const save = async (): Promise<ConflictException | null> => {
      await this.repo.query('SAVEPOINT row_update');
      try {
        await this.repo.save(patient);
        await this.repo.query('RELEASE SAVEPOINT row_update');
        return null;
      } catch (err) {
        await this.repo.query('ROLLBACK TO SAVEPOINT row_update');
        const mapped = this.mapWriteError(err);
        if (mapped instanceof ConflictException) return mapped;
        throw err;
      }
    };

    const conflict = await save();
    if (!conflict) return { changed: true };

    // One clashing field must not throw away the rest of the row. The only
    // unique value this can touch is the documentId (the legacy file really
    // does repeat a DNI across different historias — family members, or
    // duplicate patients), so: leave the document as it was, apply every
    // other field, and report the document as a note on the row.
    delete changes.documentId;
    if (!('documentId' in dto) || Object.keys(changes).length === 0) {
      return { reason: conflict.message };
    }
    patient.documentId = previousDocumentId;
    const retry = await save();
    if (retry) return { reason: retry.message };
    return {
      changed: true,
      note: `${conflict.message} ("${dto.documentId}"): se actualizó el resto de la ficha, pero no el documento`,
    };
  }

  private async updateRow(
    row: UpdateRow,
    rowNumber: number,
    typeById: Map<string, AntecedenteType>,
    personalIdByName: Map<string, string>,
    insuranceCache: Map<string, string>,
  ): Promise<RowOutcome> {
    if (!row.legacyId) {
      return { created: false, reason: 'Falta el nº de historia' };
    }
    const patient = await this.repo.findOne({
      where: { legacyId: row.legacyId },
    });
    if (!patient) {
      return {
        created: false,
        reason: `No existe ningún paciente con el nº de historia "${row.legacyId}" — impórtalo primero desde Pacientes`,
      };
    }

    let touched = false;

    const fieldsResult = await this.applyPatientFields(
      patient,
      row,
      insuranceCache,
    );
    if ('reason' in fieldsResult) {
      return { created: false, reason: fieldsResult.reason };
    }
    if (fieldsResult.changed) touched = true;
    const note = fieldsResult.note;

    if (
      row.firstConsultationOverride &&
      patient.firstConsultationOverride !== row.firstConsultationOverride
    ) {
      patient.firstConsultationOverride = row.firstConsultationOverride;
      touched = true;
    }
    if (row.notes) {
      // Same treatment as importRow: a legacy cell is plain text, and the
      // client renders notes as raw HTML — plainTextToRichText escapes it
      // (newlines -> <br>) and runs it through the same allowlist.
      const notes = plainTextToRichText(row.notes);
      if (patient.notes !== notes) {
        patient.notes = notes;
        touched = true;
      }
    }
    if (touched) {
      await this.repo.save(patient);
    }

    if (row.antecedentes && row.antecedentes.length > 0) {
      const antecedenteRepo =
        this.tenancyContext.manager.getRepository(PatientAntecedente);
      for (const { antecedenteTypeId, detalle } of row.antecedentes) {
        const type = typeById.get(antecedenteTypeId);
        // Stale id (the type was deleted/renamed since the mapping was
        // confirmed in the wizard) — skip just this antecedente, not the
        // whole row; firstConsultationOverride above may still have gone
        // through.
        if (!type) continue;

        // upsert() is idempotent by design (re-importing the same file
        // twice must be safe), but that means it alone can't tell us
        // whether this row actually changed anything — checking the
        // existing mark first is what keeps `touched`, and therefore the
        // reported "created" count, honest on a re-run.
        const existing = await antecedenteRepo.findOne({
          where: { patientId: patient.id, antecedenteTypeId },
        });
        if (!existing || existing.detalle !== detalle) {
          await antecedenteRepo.upsert(
            {
              tenantId: this.tenancyContext.tenantId,
              patientId: patient.id,
              antecedenteTypeId,
              detalle,
            },
            ['patientId', 'antecedenteTypeId'],
          );
          touched = true;
        }

        // The duplicate this whole update exists to fix: the original
        // import mapped the same legacy column to both the personal and
        // familiar antecedente of the same name (see suggestAntecedenteMapping).
        // Marking the familiar one correctly here also means removing
        // whatever got wrongly marked personal for that same patient.
        if (type.category === 'familiar') {
          const siblingPersonalId = personalIdByName.get(
            type.name.trim().toLowerCase(),
          );
          if (siblingPersonalId) {
            const { affected } = await antecedenteRepo.delete({
              patientId: patient.id,
              antecedenteTypeId: siblingPersonalId,
            });
            if (affected) touched = true;
          }
        }
      }
    }

    if (!touched) {
      return {
        created: false,
        reason:
          'Nada que actualizar en esta fila (los datos del fichero ya coinciden con los del paciente, o no traen nada nuevo)',
      };
    }
    // `note` = actualizada, pero con una incidencia que el usuario debe ver
    // (ImportJobsService.advance la anota sin quitarle la cuenta).
    return note ? { created: true, reason: note } : { created: true };
  }

  async update(id: string, dto: UpdatePatientDto): Promise<Patient> {
    const patient = await this.findOne(id);
    await this.assertHolder(patient, dto);
    this.repo.merge(patient, {
      ...dto,
      ...(dto.notes ? { notes: sanitizeRichText(dto.notes) } : {}),
    });
    try {
      return await this.repo.save(patient);
    } catch (err) {
      throw this.mapWriteError(err);
    }
  }

  // Familiar a cargo (titular + parentesco). Reglas que la BD no puede
  // comprobar sola: el titular existe en esta clínica (RLS) y no es él
  // mismo; nada de cadenas — el titular no puede ser a su vez familiar a
  // cargo, y quien ya tiene familiares a cargo no puede pasar a serlo de
  // otro —; y parentesco obligatorio si hay titular. Quitar el titular
  // quita también el parentesco. Normaliza `dto` en el sitio.
  private async assertHolder(
    patient: Patient | null,
    dto: Pick<CreatePatientDto, 'holderPatientId' | 'holderRelationship'>,
  ): Promise<void> {
    if (
      dto.holderPatientId === undefined &&
      dto.holderRelationship === undefined
    ) {
      return;
    }
    const holderId =
      dto.holderPatientId !== undefined
        ? dto.holderPatientId
        : (patient?.holderPatientId ?? null);
    const relationship =
      dto.holderRelationship !== undefined
        ? dto.holderRelationship
        : (patient?.holderRelationship ?? null);

    if (!holderId) {
      dto.holderPatientId = null;
      dto.holderRelationship = null;
      return;
    }
    if (!relationship) {
      throw new BadRequestException('Indica el parentesco con el titular');
    }
    if (patient && holderId === patient.id) {
      throw new BadRequestException(
        'Un paciente no puede ser su propio titular',
      );
    }
    const holder = await this.repo.findOne({ where: { id: holderId } });
    if (!holder) {
      throw new BadRequestException(
        'El titular elegido no existe en esta clínica',
      );
    }
    if (holder.holderPatientId) {
      throw new BadRequestException(
        `${holder.firstName} ${holder.lastName} es a su vez familiar a cargo de otro paciente: elige como titular a su titular`,
      );
    }
    if (patient) {
      const dependents = await this.repo.count({
        where: { holderPatientId: patient.id },
      });
      if (dependents > 0) {
        throw new BadRequestException(
          'Este paciente tiene familiares a cargo, así que no puede ser a su vez familiar a cargo de otro',
        );
      }
    }
    dto.holderPatientId = holderId;
    dto.holderRelationship = relationship;
  }

  // Titular y familiares a cargo para mostrarlos en la ficha / PDF. Un
  // titular dado de baja (soft delete) no aparece: findOne ya lo excluye.
  async findHolderLinks(patient: Patient): Promise<{
    holder: HolderSummary | null;
    dependents: (HolderSummary & {
      holderRelationship: HolderRelationship | null;
    })[];
  }> {
    const summary = (p: Patient): HolderSummary => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      documentId: p.documentId,
      legacyId: p.legacyId,
    });
    const [holder, dependents] = await Promise.all([
      patient.holderPatientId
        ? this.repo.findOne({ where: { id: patient.holderPatientId } })
        : null,
      this.repo.find({
        where: { holderPatientId: patient.id },
        order: { lastName: 'ASC', firstName: 'ASC' },
      }),
    ]);
    return {
      holder: holder ? summary(holder) : null,
      dependents: dependents.map((d) => ({
        ...summary(d),
        holderRelationship: d.holderRelationship,
      })),
    };
  }

  async softDelete(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.softDelete(id);
  }

  // Backs the patients list's bulk "Dar de baja" — reuses softDelete's own
  // existence check (findOne, RLS) per id instead of a single multi-row
  // UPDATE, so an id that's already gone is reported back as skipped
  // rather than the whole selection failing or silently affecting fewer
  // rows than expected.
  async bulkSoftDelete(ids: string[]): Promise<BulkDeleteResult> {
    const skipped: { id: string; reason: string }[] = [];
    let deleted = 0;

    for (const id of ids) {
      try {
        await this.softDelete(id);
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
          'Ya se ha importado un paciente con este número de historia',
        );
      }
      return new ConflictException(
        'Ya existe un paciente con este número de documento',
      );
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
