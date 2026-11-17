import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppointmentsService } from '../appointments/appointments.service';
import type { CurrentUserPayload } from '../iam/current-user.decorator';
import { User } from '../iam/entities/user.entity';
import { Patient } from '../patients/entities/patient.entity';
import { PatientsService } from '../patients/patients.service';
import { TenancyContext } from '../tenancy/tenancy-context';
import { BookingDto, SlotQueryDto } from './whatsapp-booking.dto';

type Slot = { scheduledAt: Date; durationMinutes: number };

function canonicalPhone(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^[67]\d{8}$/.test(digits)) digits = `34${digits}`;
  return digits;
}

function normalizedName(value: string): string {
  return value
    .trim()
    .normalize('NFKC')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ');
}

@Injectable()
export class WhatsappBookingService {
  constructor(
    private readonly context: TenancyContext,
    private readonly config: ConfigService,
    private readonly appointments: AppointmentsService,
    private readonly patients: PatientsService,
  ) {}

  private allowedIds(): string[] {
    return (this.config.get<string>('WHATSAPP_BOOKING_PRACTITIONERS') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  async practitioners() {
    return this.context.manager
      .getRepository(User)
      .createQueryBuilder('u')
      .select(['u.id', 'u.firstName', 'u.lastName'])
      .where('u.tenantId = :tenantId', { tenantId: this.context.tenantId })
      .andWhere('u.id IN (:...ids)', { ids: this.allowedIds() })
      .andWhere('u.active = true')
      .andWhere(
        "(u.role = 'profesional' OR (u.role = 'admin' AND u.staffFunction = 'profesional'))",
      )
      .orderBy('u.firstName', 'ASC')
      .getMany();
  }

  private async assertPractitioner(id: string) {
    if (!(await this.practitioners()).some((person) => person.id === id)) {
      throw new BadRequestException('Profesional no disponible para reservas');
    }
  }

  private async candidates(
    query: SlotQueryDto,
    includeBusy: boolean,
  ): Promise<Slot[]> {
    await this.assertPractitioner(query.practitionerId);
    const bounds = await this.context.manager.query<{ valid: boolean }[]>(
      `SELECT $1::date BETWEEN (now() AT TIME ZONE 'Europe/Madrid')::date
         AND (now() AT TIME ZONE 'Europe/Madrid')::date + 30 AS valid`,
      [query.date],
    );
    if (!bounds[0].valid)
      throw new BadRequestException('Fecha fuera del plazo de reserva');

    // The entire appointment must fit within opening hours; PostgreSQL does
    // timezone conversion and checks overlap against every appointment, without
    // the pagination limit used by the calendar UI. Nonexistent DST times are
    // discarded through the round-trip test.
    return this.context.manager.query<Slot[]>(
      `
      WITH candidates AS (
        SELECT g.local_at, g.local_at AT TIME ZONE 'Europe/Madrid' AS instant,
               t.default_appointment_duration_minutes AS duration
        FROM iam.clinic_hours h
        JOIN iam.tenants t ON t.id = h.tenant_id
        CROSS JOIN LATERAL generate_series(
          $1::date + h.start_time,
          $1::date + h.end_time - make_interval(mins => t.default_appointment_duration_minutes),
          interval '15 minutes'
        ) g(local_at)
        WHERE h.tenant_id = $2::uuid
          AND h.weekday = (extract(isodow FROM $1::date)::integer - 1)
      )
      SELECT instant AS "scheduledAt", duration AS "durationMinutes"
      FROM candidates c
      WHERE instant > now()
        AND (instant AT TIME ZONE 'Europe/Madrid') = local_at
        AND ($4::boolean OR NOT EXISTS (
          SELECT 1 FROM public.appointments a
          WHERE a.practitioner_id = $3::uuid AND a.deleted_at IS NULL
            AND a.status <> 'cancelled'
            AND appointment_time_range(a.scheduled_at, a.duration_minutes)
                && appointment_time_range(c.instant, c.duration)
        ))
      ORDER BY instant LIMIT 100
    `,
      [query.date, this.context.tenantId, query.practitionerId, includeBusy],
    );
  }

  async availableDates(practitionerId: string): Promise<string[]> {
    await this.assertPractitioner(practitionerId);
    const rows = await this.context.manager.query<{ date: string }[]>(
      `WITH days AS (
         SELECT (now() AT TIME ZONE 'Europe/Madrid')::date + g.day AS day
         FROM generate_series(0, 30) AS g(day)
       ), candidates AS (
         SELECT d.day, g.local_at, g.local_at AT TIME ZONE 'Europe/Madrid' AS instant,
                t.default_appointment_duration_minutes AS duration
         FROM days d
         JOIN iam.clinic_hours h ON h.tenant_id = $1::uuid
           AND h.weekday = extract(isodow FROM d.day)::integer - 1
         JOIN iam.tenants t ON t.id = h.tenant_id
         CROSS JOIN LATERAL generate_series(
           d.day + h.start_time,
           d.day + h.end_time - make_interval(mins => t.default_appointment_duration_minutes),
           interval '15 minutes'
         ) g(local_at)
       )
       SELECT DISTINCT to_char(c.day, 'YYYY-MM-DD') AS date
       FROM candidates c
       WHERE c.instant > now()
         AND (c.instant AT TIME ZONE 'Europe/Madrid') = c.local_at
         AND NOT EXISTS (
           SELECT 1 FROM public.appointments a
           WHERE a.practitioner_id = $2::uuid AND a.deleted_at IS NULL
             AND a.status <> 'cancelled'
             AND appointment_time_range(a.scheduled_at, a.duration_minutes)
                 && appointment_time_range(c.instant, c.duration)
         )
       ORDER BY date`,
      [this.context.tenantId, practitionerId],
    );
    return rows.map((row) => row.date);
  }

  async slots(query: SlotQueryDto) {
    return (await this.candidates(query, false)).map((slot) => ({
      scheduledAt: slot.scheduledAt.toISOString(),
      durationMinutes: slot.durationMinutes,
    }));
  }

  async book(dto: BookingDto, key?: string) {
    if (!key || !/^[A-Za-z0-9._:-]{1,128}$/.test(key)) {
      throw new BadRequestException(
        'Se necesita una clave de idempotencia válida',
      );
    }
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();
    if (
      !firstName ||
      !lastName ||
      dto.dateOfBirth > new Date().toISOString().slice(0, 10)
    ) {
      throw new BadRequestException('Datos de paciente no válidos');
    }
    const instant = new Date(dto.scheduledAt);
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
    const candidate = (
      await this.candidates({ practitionerId: dto.practitionerId, date }, true)
    ).find((slot) => slot.scheduledAt.getTime() === instant.getTime());
    if (!candidate)
      throw new ConflictException('Horario no disponible para reservas');

    const phone = canonicalPhone(dto.phone);
    // Lock before lookup and patient creation to avoid duplicates across two
    // simultaneous booking requests from the same number.
    await this.context.manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`whatsapp-patient:${this.context.tenantId}:${phone}`],
    );
    const suffix =
      phone.startsWith('34') && phone.length === 11 ? phone.slice(2) : phone;
    const matches = await this.context.manager
      .getRepository(Patient)
      .createQueryBuilder('p')
      .where(
        "regexp_replace(p.phone, '[^0-9]', '', 'g') LIKE :phone OR regexp_replace(COALESCE(p.phone2, ''), '[^0-9]', '', 'g') LIKE :phone",
        { phone: `%${suffix}%` },
      )
      .getMany();
    let patient: Patient;
    if (matches.length) {
      if (
        matches.length !== 1 ||
        ![matches[0].phone, matches[0].phone2 ?? ''].some(
          (p) => canonicalPhone(p) === phone,
        ) ||
        normalizedName(matches[0].firstName) !== normalizedName(firstName) ||
        normalizedName(matches[0].lastName) !== normalizedName(lastName) ||
        matches[0].dateOfBirth !== dto.dateOfBirth
      ) {
        throw new ConflictException('Es necesaria la revisión de recepción');
      }
      patient = matches[0];
    } else {
      // A matching person with a different phone is ambiguous, not a new patient.
      const similar = await this.context.manager
        .getRepository(Patient)
        .createQueryBuilder('p')
        .where('lower(trim(p.firstName)) = lower(:firstName)', { firstName })
        .andWhere('lower(trim(p.lastName)) = lower(:lastName)', { lastName })
        .andWhere('p.dateOfBirth = :dob', { dob: dto.dateOfBirth })
        .getCount();
      if (similar)
        throw new ConflictException('Es necesaria la revisión de recepción');
      patient = await this.patients.create({
        firstName,
        lastName,
        dateOfBirth: dto.dateOfBirth,
        phone: dto.phone,
      });
    }
    const actor: CurrentUserPayload = {
      userId: '00000000-0000-4000-8000-000000000000',
      tenantId: this.context.tenantId,
      role: 'recepcion',
      firstName: 'Integración',
      lastName: 'WhatsApp',
      agendaAccess: true,
      honorific: 'Dr.',
      staffFunction: null,
    };
    const appointment = await this.appointments.create(
      patient.id,
      {
        practitionerId: dto.practitionerId,
        scheduledAt: instant.toISOString(),
        durationMinutes: candidate.durationMinutes,
      },
      actor,
      key,
    );
    return {
      id: appointment.id,
      scheduledAt: appointment.scheduledAt,
      durationMinutes: appointment.durationMinutes,
      practitionerId: appointment.practitionerId,
      status: appointment.status,
    };
  }
}
