import { BadRequestException } from '@nestjs/common';
import { ClinicHour } from '../iam/entities/clinic-hour.entity';
import { DayScheduleDto } from './dto/update-schedule.dto';

export interface TimeSlot {
  startTime: string;
  endTime: string;
}

export interface DaySchedule {
  weekday: number;
  slots: TimeSlot[];
}

// TypeORM returns `time` columns as "HH:MM:SS" — trim to "HH:MM" so the
// API's shape always matches what it accepts on the way in.
function toHHMM(time: string): string {
  return time.slice(0, 5);
}

// Always 7 entries (0=Monday..6=Sunday), sorted by start time — a weekday
// with no rows comes back with an empty slots array (closed).
export function groupByWeekday(rows: ClinicHour[]): DaySchedule[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    slots: rows
      .filter((r) => r.weekday === weekday)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((r) => ({
        startTime: toHHMM(r.startTime),
        endTime: toHHMM(r.endTime),
      })),
  }));
}

// Rejects malformed ranges (end <= start) and overlapping slots within the
// same day before anything touches the database — the DB's own CHECK
// (end_time > start_time) is the backstop, not the primary error message.
export function assertNoOverlap(days: DayScheduleDto[]): void {
  for (const day of days) {
    const sorted = [...day.slots].sort((a, b) =>
      a.startTime.localeCompare(b.startTime),
    );
    for (let i = 0; i < sorted.length; i++) {
      const slot = sorted[i];
      if (slot.endTime <= slot.startTime) {
        throw new BadRequestException(
          `Invalid time range on weekday ${day.weekday}: ${slot.startTime}-${slot.endTime}`,
        );
      }
      const next = sorted[i + 1];
      if (next && next.startTime < slot.endTime) {
        throw new BadRequestException(
          `Overlapping time slots on weekday ${day.weekday}`,
        );
      }
    }
  }
}

// Flattens for insert — days with an empty slots array simply contribute
// no rows, which is exactly what "closed" means here.
export function toRows(
  tenantId: string,
  days: DayScheduleDto[],
): Partial<ClinicHour>[] {
  return days.flatMap((day) =>
    day.slots.map((slot) => ({
      tenantId,
      weekday: day.weekday,
      startTime: slot.startTime,
      endTime: slot.endTime,
    })),
  );
}

// Mon-Fri, morning + afternoon — same default the ClinicHoursSlots
// migration backfilled onto every tenant that already existed at the time.
// Used by PlatformService.createTenant() so a brand-new clinic doesn't
// start out looking closed every day of the week until someone visits
// Configuración.
export function defaultScheduleRows(tenantId: string): Partial<ClinicHour>[] {
  const weekdays = [0, 1, 2, 3, 4];
  const slots = [
    { startTime: '09:00', endTime: '13:00' },
    { startTime: '16:00', endTime: '20:00' },
  ];
  return weekdays.flatMap((weekday) =>
    slots.map((slot) => ({ tenantId, weekday, ...slot })),
  );
}
