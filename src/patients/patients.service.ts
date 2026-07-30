import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
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

  async findAll(
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<Patient>> {
    const [data, total] = await this.repo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { data, total, page, pageSize };
  }

  async findOne(id: string): Promise<Patient> {
    const patient = await this.repo.findOne({ where: { id } });
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

  async softDelete(id: string): Promise<void> {
    await this.findOne(id);
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
