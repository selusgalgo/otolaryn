import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClinicHour } from '../iam/entities/clinic-hour.entity';
import { Tenant } from '../iam/entities/tenant.entity';
import { UpdateAppointmentDefaultsDto } from './dto/update-appointment-defaults.dto';
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
}
