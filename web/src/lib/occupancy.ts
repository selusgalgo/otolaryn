import { toDateKey } from "@/lib/calendar-grid";
import type { AppointmentStatus, Schedule } from "@/lib/types";

export type DayOccupancy = "closed" | "free" | "full";

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

// Verde/rojo/gris, nada de matices intermedios: verde en cuanto queda
// algún hueco reservable ese día (recién abierto o casi lleno, da igual),
// rojo solo cuando no queda ninguno, gris cuando la clínica no atiende ese
// día (cerrado o vacaciones — sin tramos configurados). Se mide contra las
// horas *abiertas* de la clínica, no un recuento de citas — una cita larga
// llena un tramo tanto como varias cortas. Las citas canceladas liberan su
// hueco y no cuentan; el resto (scheduled, completed, no_show) sigue
// contando como ocupado aunque ya haya pasado.
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

  return busyWithinOpenMinutes >= openMinutes ? "full" : "free";
}

function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// Every bookable "HH:MM" start time on one specific day — backs the
// calendars' "click a day, see its free hours" popover. Unlike
// findNextFreeSlots (which scans forward across many days hunting for a
// fixed count), this always returns the *whole* day's remaining slots, so
// clicking today mid-afternoon shows only what's still actually bookable
// and clicking a full day correctly shows none, rather than skipping ahead
// to tomorrow.
export function computeDayFreeSlots(
  date: Date,
  appointmentsThatDay: OccupancyAppointment[],
  schedule: Schedule,
  slotMinutes = 30,
): string[] {
  const daySchedule = schedule.days.find((d) => d.weekday === weekdayOf(date));
  if (!daySchedule || daySchedule.slots.length === 0) return [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // A day already gone has no "free hours" in any bookable sense — without
  // this, a fully-past day would wrongly list its whole schedule as open
  // (only *today* gets clamped to the current time below).
  if (date < todayStart) return [];

  const busyRanges = mergeRanges(
    appointmentsThatDay
      .filter((a) => a.status !== "cancelled")
      .map((a) => {
        const start = new Date(a.scheduledAt);
        const startMinutes = start.getHours() * 60 + start.getMinutes();
        return { start: startMinutes, end: startMinutes + a.durationMinutes };
      }),
  );

  const isToday = date.toDateString() === now.toDateString();
  const nowMinutes = isToday ? Math.ceil((now.getHours() * 60 + now.getMinutes()) / slotMinutes) * slotMinutes : 0;

  const slots: string[] = [];
  for (const openSlot of daySchedule.slots) {
    const openEnd = timeToMinutes(openSlot.endTime);
    let cursor = Math.max(timeToMinutes(openSlot.startTime), nowMinutes);
    while (cursor + slotMinutes <= openEnd) {
      const candidate = { start: cursor, end: cursor + slotMinutes };
      if (!busyRanges.some((busy) => overlapMinutes(candidate, busy) > 0)) {
        slots.push(minutesToTime(cursor));
      }
      cursor += slotMinutes;
    }
  }
  return slots;
}

// Shared by both calendars that color days by occupancy (Agenda's
// OccupancyCalendar and Escritorio's AgendaCalendar) — one source of truth
// for the verde/rojo/gris palette and its legend labels, so the two
// calendars can't drift out of sync with each other.
export const OCCUPANCY_STYLES: Record<DayOccupancy, string> = {
  // Semantic color rule: 700 for the foreground, 100 for the background.
  free: "bg-green-100 text-green-700 hover:bg-green-200",
  full: "bg-red-100 text-red-700 hover:bg-red-200",
  closed: "bg-muted/50 text-muted-foreground/60",
};

export const OCCUPANCY_LEGEND: { key: DayOccupancy; label: string; swatch: string }[] = [
  { key: "free", label: "Disponible", swatch: "bg-green-700" },
  { key: "full", label: "Completo", swatch: "bg-red-700" },
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
