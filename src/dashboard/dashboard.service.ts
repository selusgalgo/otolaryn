import { Injectable } from '@nestjs/common';
import { Appointment } from '../appointments/entities/appointment.entity';
import { ClinicalEntry } from '../clinical-entries/entities/clinical-entry.entity';
import type { CurrentUserPayload } from '../iam/current-user.decorator';
import { TenancyContext } from '../tenancy/tenancy-context';

export interface TodayDashboard {
  appointments: Appointment[];
  // Omitted entirely (not just empty) for recepcion — that role has no
  // access to clinical content at all.
  clinicalEntries: ClinicalEntry[] | null;
}

@Injectable()
export class DashboardService {
  constructor(private readonly tenancyContext: TenancyContext) {}

  // No explicit WHERE tenant_id anywhere here on purpose: RLS is what must
  // filter this, not application code remembering to. The professional
  // filter below is an *additional* condition on top of that, never a
  // substitute for it.
  async getToday(
    user: CurrentUserPayload,
    date: string,
  ): Promise<TodayDashboard> {
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    const appointmentsQb = this.tenancyContext.manager
      .getRepository(Appointment)
      .createQueryBuilder('a')
      .where('a.scheduledAt >= :dayStart AND a.scheduledAt <= :dayEnd', {
        dayStart,
        dayEnd,
      })
      .orderBy('a.scheduledAt', 'ASC');

    // profesional: only their own agenda (plus unassigned slots, which
    // shouldn't exist going forward now that practitionerId is required on
    // create, but old data may still have some). admin/recepcion: the
    // whole clinic's agenda for the day.
    if (user.role === 'profesional') {
      appointmentsQb.andWhere(
        '(a.practitionerId IS NULL OR a.practitionerId = :userId)',
        { userId: user.userId },
      );
    }

    const appointments = await appointmentsQb.getMany();

    if (user.role === 'recepcion') {
      return { appointments, clinicalEntries: null };
    }

    const clinicalEntriesQb = this.tenancyContext.manager
      .getRepository(ClinicalEntry)
      .createQueryBuilder('c')
      .where('c.visitDate >= :dayStart AND c.visitDate <= :dayEnd', {
        dayStart,
        dayEnd,
      })
      .orderBy('c.visitDate', 'DESC');

    // profesional: only entries they authored. admin: every entry today
    // (full clinic visibility).
    if (user.role === 'profesional') {
      clinicalEntriesQb.andWhere('c.authorUserId = :userId', {
        userId: user.userId,
      });
    }

    const clinicalEntries = await clinicalEntriesQb.getMany();

    return { appointments, clinicalEntries };
  }
}
