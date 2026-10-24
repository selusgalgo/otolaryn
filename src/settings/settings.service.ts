import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { ClinicHour } from '../iam/entities/clinic-hour.entity';
import { Tenant } from '../iam/entities/tenant.entity';
import { UpdateAppointmentDefaultsDto } from './dto/update-appointment-defaults.dto';
import { UpdateDeviceLockDto } from './dto/update-device-lock.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
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
  ) {}

  async getSchedule(tenantId: string): Promise<Schedule> {
    const rows = await this.clinicHours.find({ where: { tenantId } });
    return { days: groupByWeekday(rows) };
  }

  async updateSchedule(
    tenantId: string,
    dto: UpdateScheduleDto,
  ): Promise<Schedule> {
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
  }

  private async findTenant(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
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
    const tenant = await this.findTenant(tenantId);
    tenant.defaultAppointmentDurationMinutes = dto.defaultDurationMinutes;
    await this.tenants.save(tenant);
    return { defaultDurationMinutes: tenant.defaultAppointmentDurationMinutes };
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
    const tenant = await this.findTenant(tenantId);
    tenant.deviceLockEnabled = dto.enabled;
    await this.tenants.save(tenant);
    return {
      enabled: tenant.deviceLockEnabled,
      hasCredential: tenant.deviceSecretHash !== null,
    };
  }

  // Returns the raw token exactly once — only the argon2 hash is persisted,
  // so this is the only moment the admin can see/copy the install link.
  // Replaces (not adds to) any previous credential: every device installed
  // from an earlier link stops working immediately, the same instant this
  // saves, via JwtStrategy's live re-check on the next request each makes.
  async generateDeviceCredential(
    tenantId: string,
  ): Promise<{ token: string } & DeviceLock> {
    const tenant = await this.findTenant(tenantId);
    const token = randomBytes(32).toString('base64url');
    tenant.deviceSecretHash = await argon2.hash(token);
    await this.tenants.save(tenant);
    return {
      token,
      enabled: tenant.deviceLockEnabled,
      hasCredential: true,
    };
  }

  // Drops the stored credential without touching the enabled toggle — every
  // installed device stops working (enforceDeviceLock short-circuits once
  // deviceSecretHash is null), and the admin can generate a fresh one later.
  async revokeDeviceCredential(tenantId: string): Promise<DeviceLock> {
    const tenant = await this.findTenant(tenantId);
    tenant.deviceSecretHash = null;
    await this.tenants.save(tenant);
    return { enabled: tenant.deviceLockEnabled, hasCredential: false };
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
  }
}
