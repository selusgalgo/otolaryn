import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../iam/entities/tenant.entity';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

export interface Schedule {
  openDays: boolean[];
}

// admin's own clinic only — tenantId always comes from the caller's JWT
// (@CurrentUser), never from the body, so admin can't reach another
// clinic's schedule by guessing an id. iam.tenants carries no RLS (same as
// iam.users), so this is a direct repo access, no TenancyContext.
@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  private async findTenant(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) {
      // Can't actually happen for a valid admin JWT (the tenant it was
      // issued for still exists), but keeps this honest about its type.
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async getSchedule(tenantId: string): Promise<Schedule> {
    const tenant = await this.findTenant(tenantId);
    return { openDays: tenant.openDays };
  }

  async updateSchedule(
    tenantId: string,
    dto: UpdateScheduleDto,
  ): Promise<Schedule> {
    const tenant = await this.findTenant(tenantId);
    tenant.openDays = dto.openDays;
    const saved = await this.tenants.save(tenant);
    return { openDays: saved.openDays };
  }
}
