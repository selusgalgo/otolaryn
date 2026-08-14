import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError, SelectQueryBuilder } from 'typeorm';
import type { CurrentUserPayload } from '../iam/current-user.decorator';
import { TenancyContext } from '../tenancy/tenancy-context';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { Patient } from './entities/patient.entity';

const UNIQUE_VIOLATION = '23505';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class PatientsService {
  constructor(private readonly tenancyContext: TenancyContext) {}

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

  private mapWriteError(err: unknown): Error {
    if (
      err instanceof QueryFailedError &&
      (err as { code?: string }).code === UNIQUE_VIOLATION
    ) {
      return new ConflictException(
        'A patient with this document ID already exists',
      );
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
