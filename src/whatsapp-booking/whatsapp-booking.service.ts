import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  defaultWhatsappFeatures,
  WhatsappFeaturesDto,
} from '../settings/dto/whatsapp-features.dto';
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

  async clinicSettings(): Promise<{
    platformEnabled: boolean;
    clinicEnabled: boolean;
    askReason: boolean;
    horizonDays: number;
    leadMinutes: number;
    practitionerIds: string[];
    features: WhatsappFeaturesDto;
  }> {
    const rows = await this.context.manager.query(
      `SELECT platform_enabled AS "platformEnabled", clinic_enabled AS "clinicEnabled", ask_reason AS "askReason", horizon_days AS "horizonDays", lead_minutes AS "leadMinutes", practitioner_ids AS "practitionerIds", features FROM iam.whatsapp_booking_settings WHERE tenant_id = $1`,
      [this.context.tenantId],
    );
    const settings = rows[0] ?? {
      platformEnabled: false,
      clinicEnabled: false,
      askReason: true,
      horizonDays: 30,
      leadMinutes: 0,
      practitionerIds: [],
    };
    return {
      ...settings,
      features: { ...defaultWhatsappFeatures, ...settings.features },
    };
  }

  private async recordActivity(
    appointmentId: string,
    kind: 'booked' | 'cancelled' | 'rescheduled',
  ) {
    await this.context.manager.query(
      `INSERT INTO public.whatsapp_booking_activity (tenant_id, appointment_id, kind, notify_reception)
       SELECT tenant_id, $2, $3, COALESCE((features->>'notifyReception')::boolean, false)
       FROM iam.whatsapp_booking_settings WHERE tenant_id = $1
       ON CONFLICT DO NOTHING`,
      [this.context.tenantId, appointmentId, kind],
    );
  }

  async cancellationsEnabled(): Promise<boolean> {
    const [settings] = await this.context.manager.query<{ enabled: boolean }[]>(
      `SELECT platform_enabled AND cancellation_enabled AS enabled
       FROM iam.whatsapp_booking_settings WHERE tenant_id = $1`,
      [this.context.tenantId],
    );
    return settings?.enabled ?? false;
  }

  async cancellableAppointments(
    phone: string,
    dateOfBirth: string,
    fullName?: string,
    reschedule = false,
  ) {
    const patients = await this.context.manager
      .getRepository(Patient)
      .createQueryBuilder('p')
      .where('p.dateOfBirth = :dateOfBirth', { dateOfBirth })
      .andWhere(
        "(regexp_replace(p.phone, '[^0-9]', '', 'g') LIKE :suffix OR regexp_replace(COALESCE(p.phone2, ''), '[^0-9]', '', 'g') LIKE :suffix)",
        { suffix: `%${canonicalPhone(phone).slice(-9)}%` },
      )
      .getMany();
    let exact = patients.filter((p) =>
      [p.phone, p.phone2 ?? ''].some(
        (value) => canonicalPhone(value) === canonicalPhone(phone),
      ),
    );
    if (exact.length > 1 && !fullName) return null;
    if (fullName)
      exact = exact.filter(
        (p) =>
          normalizedName(`${p.firstName} ${p.lastName}`) ===
          normalizedName(fullName),
      );
    if (exact.length !== 1) return [];
    return this.context.manager.query<
      {
        id: string;
        patientId: string;
        scheduledAt: Date;
        practitionerName: string;
        visitTypeId: string | null;
      }[]
    >(
      `SELECT a.id, a.patient_id AS "patientId", a.scheduled_at AS "scheduledAt",
         a.whatsapp_visit_type AS "visitTypeId", trim(concat(u.first_name, ' ', u.last_name)) AS "practitionerName"
       FROM public.appointments a
       JOIN iam.users u ON u.id = a.practitioner_id AND u.tenant_id = a.tenant_id
       JOIN iam.whatsapp_booking_settings s ON s.tenant_id = a.tenant_id
       WHERE a.tenant_id = $1 AND a.patient_id = $2 AND a.status = 'scheduled'
         AND a.deleted_at IS NULL AND a.booking_source = 'whatsapp'
         AND s.platform_enabled AND CASE WHEN $3::boolean THEN
           s.clinic_enabled AND COALESCE((s.features->>'reschedule')::boolean, false)
           ELSE s.cancellation_enabled END
         AND a.scheduled_at > statement_timestamp()
         AND a.scheduled_at >= statement_timestamp() + make_interval(hours => s.cancellation_notice_hours)
       ORDER BY a.scheduled_at LIMIT 20`,
      [this.context.tenantId, exact[0].id, reschedule],
    );
  }

  async rescheduleAppointment(input: {
    phone: string;
    dateOfBirth: string;
    fullName?: string;
    id: string;
    expectedAt: string;
    practitionerId: string;
    scheduledAt: string;
  }) {
    const allowed = await this.cancellableAppointments(
      input.phone,
      input.dateOfBirth,
      input.fullName,
      true,
    );
    const original = allowed?.find(
      (appointment) => appointment.id === input.id,
    );
    if (!original || original.scheduledAt.toISOString() !== input.expectedAt)
      throw new ConflictException('La cita original ya no admite cambios');
    const candidate = await this.bookingCandidate(
      input.practitionerId,
      new Date(input.scheduledAt),
      original.visitTypeId ?? undefined,
      original.id,
    );
    const rows = await this.context.manager
      .query<{ id: string }[]>(
        `WITH moved AS (
        UPDATE public.appointments a SET practitioner_id = $5, scheduled_at = $6, duration_minutes = $7
        FROM iam.whatsapp_booking_settings s
        WHERE a.tenant_id = $1 AND a.id = $2 AND a.patient_id = $3 AND a.scheduled_at = $4
          AND a.status = 'scheduled' AND a.booking_source = 'whatsapp' AND a.deleted_at IS NULL
          AND a.scheduled_at > statement_timestamp()
          AND s.tenant_id = a.tenant_id AND s.platform_enabled AND s.clinic_enabled
          AND COALESCE((s.features->>'reschedule')::boolean, false)
          AND a.scheduled_at >= statement_timestamp() + make_interval(hours => s.cancellation_notice_hours)
        RETURNING a.id
      ) SELECT id FROM moved`,
        [
          this.context.tenantId,
          original.id,
          original.patientId,
          original.scheduledAt,
          input.practitionerId,
          candidate.scheduledAt,
          candidate.durationMinutes,
        ],
      )
      .catch((error: unknown) => {
        if ((error as { code?: string }).code === '23P01')
          throw new ConflictException('El horario elegido ya está ocupado');
        throw error;
      });
    if (!rows.length)
      throw new ConflictException('La cita original ya no admite cambios');
    await this.recordActivity(original.id, 'rescheduled');
  }

  async cancelAppointment(
    phone: string,
    dateOfBirth: string,
    appointmentId: string,
    expectedAt: string,
    fullName?: string,
  ): Promise<boolean> {
    const allowed = await this.cancellableAppointments(
      phone,
      dateOfBirth,
      fullName,
    );
    const selected = allowed?.find(
      (appointment) => appointment.id === appointmentId,
    );
    if (!selected || selected.scheduledAt.toISOString() !== expectedAt)
      return false;
    const rows = await this.context.manager.query<{ id: string }[]>(
      `WITH cancelled AS (
       UPDATE public.appointments a SET status = 'cancelled'
       FROM iam.whatsapp_booking_settings s
       WHERE a.tenant_id = $1 AND a.id = $2 AND a.patient_id = $3
         AND a.scheduled_at = $4 AND a.status = 'scheduled' AND a.deleted_at IS NULL
         AND a.booking_source = 'whatsapp' AND a.scheduled_at > statement_timestamp()
         AND s.tenant_id = a.tenant_id AND s.platform_enabled AND s.cancellation_enabled
         AND a.scheduled_at >= statement_timestamp() + make_interval(hours => s.cancellation_notice_hours)
       RETURNING a.id)
       SELECT id FROM cancelled`,
      [
        this.context.tenantId,
        appointmentId,
        selected.patientId,
        selected.scheduledAt,
      ],
    );
    if (rows.length) await this.recordActivity(appointmentId, 'cancelled');
    return rows.length === 1;
  }

  async practitioners(visitTypeId?: string) {
    const settings = await this.clinicSettings();
    const type = settings.features.visitTypes.find(
      (item) => item.id === visitTypeId,
    );
    if (visitTypeId && !type) return [];
    const ids =
      settings.platformEnabled && settings.clinicEnabled
        ? settings.practitionerIds.filter(
            (id) =>
              (this.context.whatsappTenantConnection || this.allowedIds().includes(id)) &&
              (!type || type.practitionerIds.includes(id)),
          )
        : [];
    if (!ids.length) return [];
    return this.context.manager
      .getRepository(User)
      .createQueryBuilder('u')
      .select(['u.id', 'u.firstName', 'u.lastName'])
      .where('u.tenantId = :tenantId', { tenantId: this.context.tenantId })
      .andWhere('u.id IN (:...ids)', { ids })
      .andWhere('u.active = true')
      .andWhere(
        "(u.role = 'profesional' OR (u.role = 'admin' AND u.staffFunction = 'profesional'))",
      )
      .orderBy('u.firstName', 'ASC')
      .getMany();
  }

  private async candidates(
    practitionerId: string,
    date: string | null,
    visitTypeId?: string,
    excludeAppointmentId?: string,
    includeBusy = false,
  ): Promise<(Slot & { day: string })[]> {
    if (
      !(await this.practitioners(visitTypeId)).some(
        (person) => person.id === practitionerId,
      )
    )
      throw new BadRequestException('Profesional no disponible para reservas');
    const settings = await this.clinicSettings();
    const type = settings.features.visitTypes.find(
      (item) => item.id === visitTypeId,
    );
    if (date) {
      const [bounds] = await this.context.manager.query<{ valid: boolean }[]>(
        `SELECT $1::date BETWEEN (now() AT TIME ZONE 'Europe/Madrid')::date
            AND (now() AT TIME ZONE 'Europe/Madrid')::date + $2::integer AS valid`,
        [date, settings.horizonDays],
      );
      if (!bounds.valid)
        throw new BadRequestException('Fecha fuera del plazo de reserva');
    }
    const rows = await this.context.manager.query<(Slot & { day: string })[]>(
      `
      WITH days AS (
        SELECT (now() AT TIME ZONE 'Europe/Madrid')::date + g.day AS day
        FROM generate_series(0, $3::integer) g(day)
      ), clinic_ranges AS (
        SELECT d.day, h.start_time, h.end_time,
          COALESCE($5::integer, t.default_appointment_duration_minutes) AS duration
        FROM days d
        JOIN iam.clinic_hours h ON h.tenant_id = $1::uuid
          AND h.weekday = extract(isodow FROM d.day)::integer - 1
        JOIN iam.tenants t ON t.id = h.tenant_id
        WHERE $2::date IS NULL OR d.day = $2::date
      ), ranges AS (
        SELECT day, start_time, end_time, duration FROM clinic_ranges WHERE NOT $6::boolean
        UNION ALL
        SELECT c.day, greatest(c.start_time, w.start::time),
          least(c.end_time, w.end::time), c.duration
        FROM clinic_ranges c
        JOIN jsonb_to_recordset($7::jsonb) w(weekday integer, start text, "end" text)
          ON w.weekday = extract(isodow FROM c.day)::integer - 1
        WHERE $6::boolean
      ), candidates AS (
        SELECT DISTINCT r.day, g.local_at, g.local_at AT TIME ZONE 'Europe/Madrid' AS instant, r.duration
        FROM ranges r
        CROSS JOIN LATERAL generate_series(
          r.day + r.start_time,
          r.day + r.end_time - make_interval(mins => r.duration),
          interval '15 minutes'
        ) g(local_at)
      )
      SELECT to_char(c.day, 'YYYY-MM-DD') AS day, c.instant AS "scheduledAt",
             c.duration AS "durationMinutes"
      FROM candidates c
      WHERE c.instant > now() + make_interval(mins => $4::integer)
        AND (c.instant AT TIME ZONE 'Europe/Madrid') = c.local_at
        AND ($9::boolean OR NOT EXISTS (
          SELECT 1 FROM public.appointments a
          WHERE a.tenant_id = $1 AND a.practitioner_id = $8::uuid
            AND a.deleted_at IS NULL AND a.status <> 'cancelled'
            AND a.id IS DISTINCT FROM $10::uuid
            AND appointment_time_range(a.scheduled_at, a.duration_minutes)
              && appointment_time_range(c.instant, c.duration)
        ))
      ORDER BY c.instant
      `,
      [
        this.context.tenantId,
        date,
        settings.horizonDays,
        settings.leadMinutes,
        type?.durationMinutes ?? null,
        settings.features.restrictHours,
        JSON.stringify(settings.features.hours),
        practitionerId,
        includeBusy,
        excludeAppointmentId ?? null,
      ],
    );
    return rows;
  }

  async availableDates(
    practitionerId: string,
    visitTypeId?: string,
    excludeAppointmentId?: string,
  ) {
    const rows = await this.candidates(
      practitionerId,
      null,
      visitTypeId,
      excludeAppointmentId,
    );
    return [...new Set(rows.map((row) => row.day))];
  }

  async slots(query: SlotQueryDto, excludeAppointmentId?: string) {
    const rows = await this.candidates(
      query.practitionerId,
      query.date,
      query.visitTypeId,
      excludeAppointmentId,
    );
    return rows.map(({ scheduledAt, durationMinutes }) => ({
      scheduledAt: scheduledAt.toISOString(),
      durationMinutes,
    }));
  }

  private async bookingCandidate(
    practitionerId: string,
    instant: Date,
    visitTypeId?: string,
    excludeAppointmentId?: string,
  ) {
    const date = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Madrid',
    }).format(instant);
    const candidates = await this.candidates(
      practitionerId,
      date,
      visitTypeId,
      excludeAppointmentId,
      true,
    );
    const match = candidates.find(
      (slot) => slot.scheduledAt.getTime() === instant.getTime(),
    );
    if (!match)
      throw new ConflictException('Horario no disponible para reservas');
    return match;
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
    if (
      !dto.visitTypeId &&
      (await this.clinicSettings()).features.visitTypes.length
    )
      throw new BadRequestException('Selecciona el tipo de cita');
    const candidate = await this.bookingCandidate(
      dto.practitionerId,
      instant,
      dto.visitTypeId,
    );

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
    // Only the explicitly configured synthetic number in the isolated demo
    // may represent several fictional people. Real numbers retain strict
    // one-phone/one-identity matching below.
    const demoPhones =
      (this.config.get<string>('WHATSAPP_BOOKING_DEMO_SHARED_PHONE') ?? '').split(',').map((value) => value.trim());
    const sharedDemo = demoPhones.some((value) => /^\+34600000\d{3}$/.test(value) && value === dto.phone);
    const exact = matches.filter(
      (p) =>
        [p.phone, p.phone2 ?? ''].some(
          (value) => canonicalPhone(value) === phone,
        ) &&
        normalizedName(p.firstName) === normalizedName(firstName) &&
        normalizedName(p.lastName) === normalizedName(lastName) &&
        p.dateOfBirth === dto.dateOfBirth,
    );
    let patient: Patient;
    if (sharedDemo && exact.length > 1) {
      throw new ConflictException('Es necesaria la revisión de recepción');
    } else if (sharedDemo && exact.length === 1) {
      patient = exact[0];
    } else if (!sharedDemo && matches.length) {
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
      patient = await this.patients.create(
        {
          firstName,
          lastName,
          dateOfBirth: dto.dateOfBirth,
          phone: dto.phone,
        },
        'whatsapp',
      );
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
    // A demo opt-in can store the synthetic alias. The reminder worker
    // resolves it only to the explicitly permitted real test recipient.
    const reminderPhone = dto.reminderOptIn ? dto.phone : undefined;
    const appointment = await this.appointments.create(
      patient.id,
      {
        practitionerId: dto.practitionerId,
        scheduledAt: instant.toISOString(),
        durationMinutes: candidate.durationMinutes,
        notes: dto.reason?.trim() || undefined,
      },
      actor,
      key,
      'whatsapp',
      dto.visitTypeId || reminderPhone
        ? {
            visitTypeId: dto.visitTypeId,
            reminderPhone,
          }
        : undefined,
    );
    if (dto.visitTypeId || dto.reminderOptIn) {
      await this.context.manager.query(
        `UPDATE public.appointments
         SET whatsapp_visit_type = COALESCE(whatsapp_visit_type, $2),
             whatsapp_reminder_phone = COALESCE(whatsapp_reminder_phone, $4)
         WHERE tenant_id = $1 AND id = $3`,
        [
          this.context.tenantId,
          dto.visitTypeId ?? null,
          appointment.id,
          reminderPhone ?? null,
        ],
      );
    }
    await this.recordActivity(appointment.id, 'booked');
    return {
      id: appointment.id,
      scheduledAt: appointment.scheduledAt,
      durationMinutes: appointment.durationMinutes,
      practitionerId: appointment.practitionerId,
      status: appointment.status,
    };
  }
}
