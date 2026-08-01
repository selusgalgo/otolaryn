import { Injectable } from '@nestjs/common';
import { Appointment } from '../appointments/entities/appointment.entity';
import { ClinicalEntry } from '../clinical-entries/entities/clinical-entry.entity';
import { TenancyContext } from '../tenancy/tenancy-context';

export interface TodayDashboard {
  appointments: Appointment[];
  clinicalEntries: ClinicalEntry[];
}

@Injectable()
export class DashboardService {
  constructor(private readonly tenancyContext: TenancyContext) {}

  // No explicit WHERE tenant_id anywhere here on purpose: RLS is what must
  // filter this, not application code remembering to. The professional
  // filter below is an *additional* condition on top of that, never a
  // substitute for it.
  async getToday(userId: string, date: string): Promise<TodayDashboard> {
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    const appointments = await this.tenancyContext.manager
      .getRepository(Appointment)
      .createQueryBuilder('a')
      .where('a.scheduledAt >= :dayStart AND a.scheduledAt <= :dayEnd', {
        dayStart,
        dayEnd,
      })
      // Own appointments plus unassigned ones — practitionerId is optional
      // and, in this app today, rarely set, so a strict "= me" filter would
      // hide almost everything from this widget.
      .andWhere('(a.practitionerId IS NULL OR a.practitionerId = :userId)', {
        userId,
      })
      .orderBy('a.scheduledAt', 'ASC')
      .getMany();

    const clinicalEntries = await this.tenancyContext.manager
      .getRepository(ClinicalEntry)
      .createQueryBuilder('c')
      .where('c.visitDate >= :dayStart AND c.visitDate <= :dayEnd', {
        dayStart,
        dayEnd,
      })
      // authorUserId is always set (taken from the JWT on creation, never
      // optional like practitionerId), so this filter is exact.
      .andWhere('c.authorUserId = :userId', { userId })
      .orderBy('c.visitDate', 'DESC')
      .getMany();

    return { appointments, clinicalEntries };
  }
}
