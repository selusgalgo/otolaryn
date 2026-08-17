import { toDateKey } from "@/lib/calendar-grid";
import type { AppointmentStatus, Schedule } from "@/lib/types";

export type DayOccupancy = "closed" | "free" | "partial" | "busy" | "full";

interface OccupancyAppointment {
  scheduledAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
}

interface MinuteRange {
  start: number;
  end: number;
}

// At or above this share of the day's open minutes booked (but below
// 100%), a day reads as "casi completo" (orange) instead of just "parcial"
// (yellow) — a nudge that the day is filling up fast, without waiting
// until it's literally unbookable to warn for it.
const NEAR_FULL_THRESHOLD = 0.8;

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
  if (busyWithinOpenMinutes >= openMinutes * NEAR_FULL_THRESHOLD) return "busy";
  return "partial";
}

// Shared by both calendars that color days by occupancy (Agenda's
// OccupancyCalendar and Escritorio's AgendaCalendar) — one source of truth
// for the verde/amarillo/naranja/rojo/gris palette and its legend labels,
// so the two calendars can't drift out of sync with each other.
export const OCCUPANCY_STYLES: Record<DayOccupancy, string> = {
  // Reuses the same tokens as AppointmentStatusBadge (--success/--destructive)
  // for verde/rojo; "parcial"/"casi completo" have no themed token yet, so
  // they're plain amber/orange.
  free: "bg-success/20 hover:bg-success/30",
  partial: "bg-amber-400/25 hover:bg-amber-400/35",
  busy: "bg-orange-500/25 hover:bg-orange-500/35",
  full: "bg-destructive/20 hover:bg-destructive/30",
  closed: "bg-muted/50 text-muted-foreground/60",
};

export const OCCUPANCY_LEGEND: { key: DayOccupancy; label: string; swatch: string }[] = [
  { key: "free", label: "Libre", swatch: "bg-success" },
  { key: "partial", label: "Parcial", swatch: "bg-amber-400" },
  { key: "busy", label: "Casi completo", swatch: "bg-orange-500" },
  { key: "full", label: "Completo", swatch: "bg-destructive" },
  { key: "closed", label: "Cerrado", swatch: "bg-muted-foreground/40" },
];

export interface FreeSlotOptions {
  slotMinutes?: number;
  count?: number;
  daysAhead?: number;
}

// Finds the next `count` free slots of `slotMinutes` length starting from
// `from` (day and, on that first day only, time-of-day), scanning forward
// day by day up to `daysAhead` days. A slot only counts as free if it falls
// entirely within one of the clinic's open tramos for that weekday and
// doesn't overlap any non-cancelled appointment. Backs the "Próximos
// horarios libres" suggestions in AppointmentForm — same aggregate,
// all-practitioners notion of "busy" as computeDayOccupancy above (this
// app doesn't track per-practitioner free/busy, only whole-clinic).
export function findNextFreeSlots(
  from: Date,
  appointmentsByDay: Map<string, OccupancyAppointment[]>,
  schedule: Schedule,
  { slotMinutes = 30, count = 5, daysAhead = 14 }: FreeSlotOptions = {},
): Date[] {
  const slots: Date[] = [];
  const searchStartDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const nowMinutesOnStartDay = from.getHours() * 60 + from.getMinutes();

  for (let dayOffset = 0; dayOffset <= daysAhead && slots.length < count; dayOffset++) {
    const day = new Date(searchStartDay);
    day.setDate(day.getDate() + dayOffset);
    const daySchedule = schedule.days.find((d) => d.weekday === weekdayOf(day));
    if (!daySchedule || daySchedule.slots.length === 0) continue;

    const busyRanges = mergeRanges(
      (appointmentsByDay.get(toDateKey(day)) ?? [])
        .filter((a) => a.status !== "cancelled")
        .map((a) => {
          const start = new Date(a.scheduledAt);
          const startMinutes = start.getHours() * 60 + start.getMinutes();
          return { start: startMinutes, end: startMinutes + a.durationMinutes };
        }),
    );

    for (const openSlot of daySchedule.slots) {
      const openEnd = timeToMinutes(openSlot.endTime);
      let cursor = timeToMinutes(openSlot.startTime);
      // Only the first scanned day needs clamping to "now" — every later
      // day is entirely in the future, so its whole open tramo is fair game.
      if (dayOffset === 0) {
        const roundedNow = Math.ceil(nowMinutesOnStartDay / slotMinutes) * slotMinutes;
        cursor = Math.max(cursor, roundedNow);
      }
      while (cursor + slotMinutes <= openEnd && slots.length < count) {
        const candidate = { start: cursor, end: cursor + slotMinutes };
        if (!busyRanges.some((busy) => overlapMinutes(candidate, busy) > 0)) {
          const slotDate = new Date(day);
          slotDate.setHours(Math.floor(cursor / 60), cursor % 60, 0, 0);
          slots.push(slotDate);
        }
        cursor += slotMinutes;
      }
    }
  }

  return slots;
}
