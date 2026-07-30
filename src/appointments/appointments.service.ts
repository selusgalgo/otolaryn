import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { PaginatedResult, PatientsService } from '../patients/patients.service';
import { TenancyContext } from '../tenancy/tenancy-context';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { Appointment } from './entities/appointment.entity';

const EXCLUSION_VIOLATION = '23P01';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly tenancyContext: TenancyContext,
    private readonly patients: PatientsService,
  ) {}

  private get repo() {
    // No explicit WHERE tenant_id here on purpose: RLS is what must filter
    // this, not application code remembering to.
    return this.tenancyContext.manager.getRepository(Appointment);
  }

  async create(
    patientId: string,
    dto: CreateAppointmentDto,
  ): Promise<Appointment> {
    // Throws NotFoundException if the patient doesn't exist or belongs to
    // another tenant — also what makes the FK on (patient_id, tenant_id)
    // succeed below.
    await this.patients.findOne(patientId);

    const appointment = this.repo.create({
      tenantId: this.tenancyContext.tenantId,
      patientId,
      practitionerId: dto.practitionerId ?? null,
      scheduledAt: new Date(dto.scheduledAt),
      durationMinutes: dto.durationMinutes ?? 30,
      status: 'scheduled',
      notes: dto.notes ?? null,
    });

    try {
      return await this.repo.save(appointment);
    } catch (err) {
      throw this.mapWriteError(err);
    }
  }

  async findAll(
    query: ListAppointmentsQueryDto,
  ): Promise<PaginatedResult<Appointment>> {
    const qb = this.repo
      .createQueryBuilder('a')
      .orderBy('a.scheduledAt', 'ASC');

    if (query.from) {
      qb.andWhere('a.scheduledAt >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('a.scheduledAt <= :to', { to: query.to });
    }
    if (query.practitionerId) {
      qb.andWhere('a.practitionerId = :practitionerId', {
        practitionerId: query.practitionerId,
      });
    }

    qb.skip((query.page - 1) * query.pageSize).take(query.pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async findOne(id: string): Promise<Appointment> {
    const appointment = await this.repo.findOne({ where: { id } });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    return appointment;
  }

  async update(id: string, dto: UpdateAppointmentDto): Promise<Appointment> {
    const appointment = await this.findOne(id);

    if (dto.scheduledAt !== undefined) {
      appointment.scheduledAt = new Date(dto.scheduledAt);
    }
    if (dto.durationMinutes !== undefined) {
      appointment.durationMinutes = dto.durationMinutes;
    }
    if (dto.practitionerId !== undefined) {
      appointment.practitionerId = dto.practitionerId;
    }
    if (dto.notes !== undefined) {
      appointment.notes = dto.notes;
    }
    if (dto.status !== undefined) {
      appointment.status = dto.status;
    }

    try {
      return await this.repo.save(appointment);
    } catch (err) {
      throw this.mapWriteError(err);
    }
  }

  private mapWriteError(err: unknown): Error {
    if (
      err instanceof QueryFailedError &&
      (err as { code?: string }).code === EXCLUSION_VIOLATION
    ) {
      return new ConflictException(
        'This practitioner already has an appointment overlapping that time',
      );
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
