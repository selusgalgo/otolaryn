import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClinicHour } from '../iam/entities/clinic-hour.entity';
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

// admin's own clinic only — tenantId always comes from the caller's JWT
// (@CurrentUser), never from the body, so admin can't reach another
// clinic's schedule by guessing an id. iam.clinic_hours carries no RLS
// (same as iam.users/iam.tenants), so this is a direct repo access, no
// TenancyContext.
@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(ClinicHour)
    private readonly clinicHours: Repository<ClinicHour>,
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
}
