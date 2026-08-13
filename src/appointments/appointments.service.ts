import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { CurrentUserPayload } from '../iam/current-user.decorator';
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
    user: CurrentUserPayload,
  ): Promise<Appointment> {
    // Existence check only — deliberately unrestricted by "own patients"
    // even for a profesional: booking someone's first appointment is
    // exactly the act that establishes that link, so requiring it upfront
    // would make it impossible to ever book a new patient. Also what makes
    // the FK on (patient_id, tenant_id) succeed below.
    await this.patients.findOne(patientId);

    // A profesional can only ever book themselves — any practitionerId sent
    // in the body is ignored, not just validated, so a crafted request can't
    // book on someone else's behalf. admin/recepcion must pick one
    // explicitly: this is also what makes the DB's no-double-booking
    // exclusion constraint actually fire (it's a no-op when
    // practitioner_id is NULL, which every appointment used to be).
    let practitionerId: string;
    if (user.role === 'profesional') {
      practitionerId = user.userId;
    } else {
      if (!dto.practitionerId) {
        throw new BadRequestException('practitionerId is required');
      }
      practitionerId = dto.practitionerId;
    }

    const appointment = this.repo.create({
      tenantId: this.tenancyContext.tenantId,
      patientId,
      practitionerId,
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
    user: CurrentUserPayload,
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
    if (user.role === 'profesional') {
      // Forced, not just defaulted — a profesional can't widen this by
      // passing a different practitionerId in the query string.
      qb.andWhere('a.practitionerId = :practitionerId', {
        practitionerId: user.userId,
      });
    } else if (query.practitionerId) {
      qb.andWhere('a.practitionerId = :practitionerId', {
        practitionerId: query.practitionerId,
      });
    }
    if (query.patientId) {
      qb.andWhere('a.patientId = :patientId', { patientId: query.patientId });
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

  async update(
    id: string,
    dto: UpdateAppointmentDto,
    user: CurrentUserPayload,
  ): Promise<Appointment> {
    const appointment = await this.findOne(id);

    if (
      user.role === 'profesional' &&
      appointment.practitionerId !== user.userId
    ) {
      throw new ForbiddenException('You can only modify your own appointments');
    }

    if (dto.scheduledAt !== undefined) {
      appointment.scheduledAt = new Date(dto.scheduledAt);
    }
    if (dto.durationMinutes !== undefined) {
      appointment.durationMinutes = dto.durationMinutes;
    }
    if (dto.practitionerId !== undefined && user.role !== 'profesional') {
      // A profesional can't reassign their own appointment to someone
      // else — only admin/recepcion redistribute the agenda.
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
