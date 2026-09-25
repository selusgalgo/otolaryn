import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ClinicHour } from '../iam/entities/clinic-hour.entity';
import type { CurrentUserPayload } from '../iam/current-user.decorator';
import { PaginatedResult, PatientsService } from '../patients/patients.service';
import { groupByWeekday } from '../settings/schedule.util';
import { TenancyContext } from '../tenancy/tenancy-context';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { Appointment } from './entities/appointment.entity';

const EXCLUSION_VIOLATION = '23P01';

// The whole app is built for one clinic in Spain (Spanish UI, no
// per-tenant locale/timezone setting anywhere) — hardcoding this here
// mirrors that same assumption the frontend's calendar math already makes
// implicitly via the browser's own local clock. A serverless host commonly
// runs Node with TZ=UTC regardless of where the request came from, so
// Date#getHours()/getDay() can't be trusted here the way the frontend
// trusts them; Intl.DateTimeFormat with an explicit IANA zone sidesteps
// that (and handles the CET/CEST switch correctly, a fixed offset wouldn't).
const CLINIC_TIME_ZONE = 'Europe/Madrid';

// Same Monday=0..Sunday=6 convention as schedule.util's DaySchedule and the
// frontend's calendar grid.
const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

function weekdayAndMinutesInClinicTimeZone(date: Date): {
  weekday: number;
  minutes: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    weekday: WEEKDAY_INDEX[get('weekday')],
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly tenancyContext: TenancyContext,
    private readonly patients: PatientsService,
    // iam.clinic_hours carries no RLS (same as iam.users/iam.tenants) — a
    // direct repo, not TenancyContext, same reasoning as SettingsService.
    @InjectRepository(ClinicHour)
    private readonly clinicHours: Repository<ClinicHour>,
  ) {}

  private get repo() {
    // No explicit WHERE tenant_id here on purpose: RLS is what must filter
    // this, not application code remembering to.
    return this.tenancyContext.manager.getRepository(Appointment);
  }

  // Rejects a time that falls outside the clinic's configured tramos for
  // that weekday (including a day with no tramos at all, i.e. closed) —
  // the calendar's colors/free-slot popover already steer people away from
  // these times, but nothing stopped a manually typed date/time from
  // landing outside them until now.
  private async assertWithinClinicHours(
    scheduledAt: Date,
    durationMinutes: number,
  ): Promise<void> {
    const rows = await this.clinicHours.find({
      where: { tenantId: this.tenancyContext.tenantId },
    });
    const days = groupByWeekday(rows);
    const { weekday, minutes: startMinutes } =
      weekdayAndMinutesInClinicTimeZone(scheduledAt);
    const endMinutes = startMinutes + durationMinutes;

    const day = days.find((d) => d.weekday === weekday);
    const fits = (day?.slots ?? []).some(
      (slot) =>
        startMinutes >= timeToMinutes(slot.startTime) &&
        endMinutes <= timeToMinutes(slot.endTime),
    );
    if (!fits) {
      throw new BadRequestException(
        'La hora elegida está fuera del horario configurado de la clínica para ese día',
      );
    }
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
        throw new BadRequestException('Selecciona un profesional');
      }
      practitionerId = dto.practitionerId;
    }

    const scheduledAt = new Date(dto.scheduledAt);
    const durationMinutes = dto.durationMinutes ?? 30;
    await this.assertWithinClinicHours(scheduledAt, durationMinutes);

    const appointment = this.repo.create({
      tenantId: this.tenancyContext.tenantId,
      patientId,
      practitionerId,
      scheduledAt,
      durationMinutes,
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
      throw new NotFoundException('Cita no encontrada');
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
      throw new ForbiddenException('Solo puede modificar sus propias citas');
    }

    if (dto.scheduledAt !== undefined || dto.durationMinutes !== undefined) {
      const scheduledAt =
        dto.scheduledAt !== undefined
          ? new Date(dto.scheduledAt)
          : appointment.scheduledAt;
      const durationMinutes =
        dto.durationMinutes !== undefined
          ? dto.durationMinutes
          : appointment.durationMinutes;
      await this.assertWithinClinicHours(scheduledAt, durationMinutes);
      appointment.scheduledAt = scheduledAt;
      appointment.durationMinutes = durationMinutes;
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
        'Ese profesional ya tiene una cita que se solapa con ese horario',
      );
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
