import type { AppointmentStatus, Schedule } from "@/lib/types";

export type DayOccupancy = "closed" | "free" | "partial" | "full";

interface OccupancyAppointment {
  scheduledAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
}

interface MinuteRange {
  start: number;
  end: number;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// Same convention as AgendaCalendar's grid and Escritorio's calendar:
// 0 = Monday.
export function weekdayOf(date: Date): number {
  return (date.getDay() + 6) % 7;
}

// Non-overlapping, sorted — adjacent/overlapping ranges are fused into one,
// so two back-to-back appointments (e.g. 09:00-10:00 and 10:00-11:00) read
// as a single 09:00-11:00 block of "someone is busy", not two separate
// gaps-of-zero.
function mergeRanges(ranges: MinuteRange[]): MinuteRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: MinuteRange[] = [sorted[0]];
  for (const range of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function overlapMinutes(a: MinuteRange, b: MinuteRange): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

// Rojo/amarillo/verde is about how much of the clinic's *open* hours that
// day are covered by appointments — not a raw appointment count, since one
// long appointment can fill a whole tramo just as much as several short
// ones. Cancelled appointments free their slot back up and don't count;
// everything else (scheduled, completed, no_show) reserved the time, so it
// still counts as occupied even after the fact.
export function computeDayOccupancy(
  date: Date,
  appointmentsThatDay: OccupancyAppointment[],
  schedule: Schedule,
): DayOccupancy {
  const weekday = weekdayOf(date);
  const day = schedule.days.find((d) => d.weekday === weekday);
  if (!day || day.slots.length === 0) {
    return "closed";
  }

  const openRanges: MinuteRange[] = day.slots.map((slot) => ({
    start: timeToMinutes(slot.startTime),
    end: timeToMinutes(slot.endTime),
  }));
  const openMinutes = openRanges.reduce((sum, r) => sum + (r.end - r.start), 0);

  const busyRanges = mergeRanges(
    appointmentsThatDay
      .filter((a) => a.status !== "cancelled")
      .map((a) => {
        const start = new Date(a.scheduledAt);
        const startMinutes = start.getHours() * 60 + start.getMinutes();
        return { start: startMinutes, end: startMinutes + a.durationMinutes };
      }),
  );

  let busyWithinOpenMinutes = 0;
  for (const open of openRanges) {
    for (const busy of busyRanges) {
      busyWithinOpenMinutes += overlapMinutes(open, busy);
    }
  }

  if (busyWithinOpenMinutes <= 0) return "free";
  if (busyWithinOpenMinutes >= openMinutes) return "full";
  return "partial";
}
