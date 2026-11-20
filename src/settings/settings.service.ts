import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import type { ConsultationTemplate } from '../clinical-entries/consultation-template';
import { ClinicHour } from '../iam/entities/clinic-hour.entity';
import { Tenant } from '../iam/entities/tenant.entity';
import { UpdateAppointmentDefaultsDto } from './dto/update-appointment-defaults.dto';
import { UpdateDeviceLockDto } from './dto/update-device-lock.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { UpdateWhatsappSettingsDto } from './dto/update-whatsapp-settings.dto';
import { withTenantSharedLock } from '../tenancy/tenant-operation-lock';
import { defaultWhatsappFeatures } from './dto/whatsapp-features.dto';
import {
  assertNoOverlap,
  DaySchedule,
  groupByWeekday,
  toRows,
} from './schedule.util';

export interface Schedule {
  days: DaySchedule[];
}

export interface AppointmentDefaults {
  defaultDurationMinutes: number;
}

export interface DeviceLock {
  enabled: boolean;
  // Only ever true once a credential has actually been generated — the
  // raw secret itself is never readable back, by design (same as a
  // password): this just tells the admin UI whether "Generar" would be a
  // first credential or a replacement, and whether disabling without a
  // credential even matters.
  hasCredential: boolean;
}

export interface ConsultationTemplateSetting {
  template: ConsultationTemplate;
}

export interface ClinicProfile {
  name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  logo: string | null;
}

// logo: undefined leaves the stored logo untouched (no new file was
// uploaded), null clears it (the "Quitar logo" action), a string replaces
// it with that data: URI — see UpdateClinicProfile's own comment on Tenant.
export interface UpdateClinicProfileInput {
  name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  logo?: string | null;
}

// admin's own clinic only — tenantId always comes from the caller's JWT
// (@CurrentUser), never from the body, so admin can't reach another
// clinic's schedule by guessing an id. iam.clinic_hours/iam.tenants carry
// no RLS (same as iam.users), so this is a direct repo access, no
// TenancyContext.
@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(ClinicHour)
    private readonly clinicHours: Repository<ClinicHour>,
    @InjectRepository(Tenant)
    private readonly tenants: Repository<Tenant>,
    private readonly dataSource: DataSource,
  ) {}

  async getWhatsappSettings(tenantId: string) {
    await this.findTenant(tenantId);
    const rows = await this.tenants.manager.query(
      `SELECT platform_enabled AS "platformEnabled", clinic_enabled AS "clinicEnabled",
              ask_reason AS "askReason", horizon_days AS "horizonDays", lead_minutes AS "leadMinutes",
              practitioner_ids AS "practitionerIds", cancellation_enabled AS "cancellationEnabled",
              cancellation_notice_hours AS "cancellationNoticeHours", features
       FROM iam.whatsapp_booking_settings WHERE tenant_id = $1`,
      [tenantId],
    );
    const settings = rows[0] ?? {
      platformEnabled: false,
      clinicEnabled: false,
      askReason: true,
      horizonDays: 30,
      leadMinutes: 0,
      cancellationEnabled: true,
      cancellationNoticeHours: 0,
      practitionerIds: [],
    };
    return {
      ...settings,
      features: { ...defaultWhatsappFeatures, ...settings.features },
    };
  }

  async updateWhatsappSettings(
    tenantId: string,
    dto: UpdateWhatsappSettingsDto,
  ) {
    return withTenantSharedLock(this.dataSource, tenantId, async () => {
      await this.findTenant(tenantId);
      const rows = await this.tenants.manager.query(
        `SELECT id FROM iam.users WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND active = true AND (role = 'profesional' OR (role = 'admin' AND staff_function = 'profesional'))`,
        [tenantId, dto.practitionerIds],
      );
      if (rows.length !== dto.practitionerIds.length)
        throw new BadRequestException(
          'Selecciona profesionales activos de esta clínica',
        );
      if (dto.features) {
        const { hours, visitTypes } = dto.features;
        const ordered = [...hours].sort(
          (a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start),
        );
        if (
          ordered.some((range, index) => {
            const previous = ordered[index - 1];
            return (
              range.start >= range.end ||
              (previous?.weekday === range.weekday &&
                previous.end > range.start)
            );
          })
        )
          throw new BadRequestException(
            'Revisa las franjas de WhatsApp: el fin debe ser posterior al inicio y no pueden solaparse',
          );
        if (
          visitTypes.some((type) =>
            type.practitionerIds.some(
              (id) => !dto.practitionerIds.includes(id),
            ),
          )
        )
          throw new BadRequestException(
            'Cada tipo de cita debe usar profesionales habilitados para WhatsApp',
          );
        if (
          dto.features.receptionPhone &&
          !/^\+?[0-9][0-9 ()-]{5,39}$/.test(dto.features.receptionPhone)
        )
          throw new BadRequestException(
            'Indica un teléfono de recepción válido',
          );
        if (
          dto.features.reminderHours > 0 &&
          (!dto.features.reminderTemplateName?.trim() ||
            !dto.features.reminderTemplateLanguage?.trim())
        )
          throw new BadRequestException(
            'Indica la plantilla y el idioma de Meta para activar los recordatorios',
          );
      }
      await this.tenants.manager.query(
        `INSERT INTO iam.whatsapp_booking_settings AS current_settings
         (tenant_id, clinic_enabled, ask_reason, horizon_days, lead_minutes, practitioner_ids,
          cancellation_enabled, cancellation_notice_hours, features)
       VALUES ($1,$2,$3,$4,$5,$6::uuid[],COALESCE($7::boolean,true),COALESCE($8::integer,0),COALESCE($9::jsonb,'{}'))
       ON CONFLICT (tenant_id) DO UPDATE SET
         clinic_enabled = EXCLUDED.clinic_enabled, ask_reason = EXCLUDED.ask_reason,
         horizon_days = EXCLUDED.horizon_days, lead_minutes = EXCLUDED.lead_minutes,
         practitioner_ids = EXCLUDED.practitioner_ids,
         cancellation_enabled = COALESCE($7::boolean,current_settings.cancellation_enabled),
         cancellation_notice_hours = COALESCE($8::integer,current_settings.cancellation_notice_hours),
         features = COALESCE(current_settings.features,'{}'::jsonb) || COALESCE($9::jsonb,'{}'::jsonb)`,
        [
          tenantId,
          dto.clinicEnabled,
          dto.askReason,
          dto.horizonDays,
          dto.leadMinutes,
          dto.practitionerIds,
          dto.cancellationEnabled,
          dto.cancellationNoticeHours,
          dto.features ? JSON.stringify(dto.features) : null,
        ],
      );
      return this.getWhatsappSettings(tenantId);
    });
  }

  async updateWhatsappPlatform(tenantId: string, enabled: boolean) {
    return withTenantSharedLock(this.dataSource, tenantId, async () => {
      await this.findTenant(tenantId);
      await this.tenants.manager.query(
        `INSERT INTO iam.whatsapp_booking_settings (tenant_id, platform_enabled) VALUES ($1, $2) ON CONFLICT (tenant_id) DO UPDATE SET platform_enabled = EXCLUDED.platform_enabled`,
        [tenantId, enabled],
      );
      return this.getWhatsappSettings(tenantId);
    });
  }

  async getSchedule(tenantId: string): Promise<Schedule> {
    const rows = await this.clinicHours.find({ where: { tenantId } });
    return { days: groupByWeekday(rows) };
  }

  async updateSchedule(
    tenantId: string,
    dto: UpdateScheduleDto,
  ): Promise<Schedule> {
    return withTenantSharedLock(this.dataSource, tenantId, async () => {
      assertNoOverlap(dto.days);

      // Full replace, not a diff of adds/removes — simpler and correct for
      // a form that submits the whole week at once.
      await this.clinicHours.manager.transaction(async (manager) => {
        await manager.delete(ClinicHour, { tenantId });
        const rows = toRows(tenantId, dto.days);
        if (rows.length > 0) {
          await manager.insert(ClinicHour, rows);
        }
      });

      return this.getSchedule(tenantId);
    });
  }

  private async findTenant(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async getConsultationTemplate(
    tenantId: string,
  ): Promise<ConsultationTemplateSetting> {
    const tenant = await this.findTenant(tenantId);
    return { template: tenant.consultationTemplate };
  }

  async getAppointmentDefaults(tenantId: string): Promise<AppointmentDefaults> {
    const tenant = await this.findTenant(tenantId);
    return {
      defaultDurationMinutes: tenant.defaultAppointmentDurationMinutes,
    };
  }

  async updateAppointmentDefaults(
    tenantId: string,
    dto: UpdateAppointmentDefaultsDto,
  ): Promise<AppointmentDefaults> {
    return withTenantSharedLock(this.dataSource, tenantId, async () => {
      const tenant = await this.findTenant(tenantId);
      tenant.defaultAppointmentDurationMinutes = dto.defaultDurationMinutes;
      await this.tenants.save(tenant);
      return {
        defaultDurationMinutes: tenant.defaultAppointmentDurationMinutes,
      };
    });
  }

  async getDeviceLock(tenantId: string): Promise<DeviceLock> {
    const tenant = await this.findTenant(tenantId);
    return {
      enabled: tenant.deviceLockEnabled,
      hasCredential: tenant.deviceSecretHash !== null,
    };
  }

  async updateDeviceLock(
    tenantId: string,
    dto: UpdateDeviceLockDto,
  ): Promise<DeviceLock> {
    return withTenantSharedLock(this.dataSource, tenantId, async () => {
      const tenant = await this.findTenant(tenantId);
      tenant.deviceLockEnabled = dto.enabled;
      await this.tenants.save(tenant);
      return {
        enabled: tenant.deviceLockEnabled,
        hasCredential: tenant.deviceSecretHash !== null,
      };
    });
  }

  // Returns the raw token exactly once — only the argon2 hash is persisted,
  // so this is the only moment the admin can see/copy the install link.
  // Replaces (not adds to) any previous credential: every device installed
  // from an earlier link stops working immediately, the same instant this
  // saves, via JwtStrategy's live re-check on the next request each makes.
  async generateDeviceCredential(
    tenantId: string,
  ): Promise<{ token: string } & DeviceLock> {
    return withTenantSharedLock(this.dataSource, tenantId, async () => {
      const tenant = await this.findTenant(tenantId);
      const token = randomBytes(32).toString('base64url');
      tenant.deviceSecretHash = await argon2.hash(token);
      await this.tenants.save(tenant);
      return {
        token,
        enabled: tenant.deviceLockEnabled,
        hasCredential: true,
      };
    });
  }

  // Drops the stored credential without touching the enabled toggle — every
  // installed device stops working (enforceDeviceLock short-circuits once
  // deviceSecretHash is null), and the admin can generate a fresh one later.
  async revokeDeviceCredential(tenantId: string): Promise<DeviceLock> {
    return withTenantSharedLock(this.dataSource, tenantId, async () => {
      const tenant = await this.findTenant(tenantId);
      tenant.deviceSecretHash = null;
      await this.tenants.save(tenant);
      return { enabled: tenant.deviceLockEnabled, hasCredential: false };
    });
  }

  async getClinicProfile(tenantId: string): Promise<ClinicProfile> {
    const tenant = await this.findTenant(tenantId);
    return {
      name: tenant.name,
      tagline: tenant.tagline,
      address: tenant.address,
      phone: tenant.phone,
      logo: tenant.logo,
    };
  }

  async updateClinicProfile(
    tenantId: string,
    input: UpdateClinicProfileInput,
  ): Promise<ClinicProfile> {
    return withTenantSharedLock(this.dataSource, tenantId, async () => {
      const tenant = await this.findTenant(tenantId);
      tenant.name = input.name;
      tenant.tagline = input.tagline;
      tenant.address = input.address;
      tenant.phone = input.phone;
      if (input.logo !== undefined) {
        tenant.logo = input.logo;
      }
      await this.tenants.save(tenant);
      return {
        name: tenant.name,
        tagline: tenant.tagline,
        address: tenant.address,
        phone: tenant.phone,
        logo: tenant.logo,
      };
    });
  }
}
