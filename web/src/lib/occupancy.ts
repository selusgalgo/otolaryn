import { toDateKey } from "@/lib/calendar-grid";
import { clinicDateInputValue, clinicLocalToUtcIso, clinicMinutesOfDay } from "@/lib/clinic-time";
import type { AppointmentStatus, Schedule } from "@/lib/types";

export type DayOccupancy = "closed" | "free" | "partial" | "full";

interface OccupancyAppointment {
  scheduledAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  // Optional only so call sites that already scoped their data to one
  // practitioner (e.g. findNextFreeSlots, always called with a single
  // practitionerId already picked) don't have to carry it around for
  // nothing — see groupByPractitioner below for what an absent value means.
  practitionerId?: string | null;
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

function busyRangesFor(appointments: OccupancyAppointment[]): MinuteRange[] {
  return mergeRanges(
    appointments
      .filter((a) => a.status !== "cancelled")
      .map((a) => {
        const startMinutes = clinicMinutesOfDay(a.scheduledAt);
        return { start: startMinutes, end: startMinutes + a.durationMinutes };
      }),
  );
}

// Several practitioners work the clinic's same open hours *in parallel* —
// one busy calendar each, not one shared calendar for the whole clinic.
// Treating every appointment as blocking the slot for everyone (the
// original design here) meant a single practitioner's fully-booked day
// made the whole clinic read as "Completo" even with two others wide open
// that same day, and hid every slot they were free at from "Todos los
// profesionales" — confirmed against a real clinic with 3 profesionales.
//
// `practitionerIds` (every practitioner that exists, only meaningful for
// that aggregate "Todos" view — a caller already scoped to one
// practitioner has no reason to pass it) makes sure someone with zero
// appointments that day still gets their own empty-and-therefore-fully-
// free bucket below, instead of vanishing from the comparison entirely.
// Without it (or with none of it caller-relevant, e.g. findNextFreeSlots'
// single already-picked practitioner), every real appointment's own
// practitionerId groups it correctly on its own regardless.
function groupByPractitioner(
  appointments: OccupancyAppointment[],
  practitionerIds?: string[],
): MinuteRange[][] {
  const byPractitioner = new Map<string, OccupancyAppointment[]>();
  for (const appointment of appointments) {
    const key = appointment.practitionerId ?? "";
    const list = byPractitioner.get(key);
    if (list) {
      list.push(appointment);
    } else {
      byPractitioner.set(key, [appointment]);
    }
  }
  for (const id of practitionerIds ?? []) {
    if (!byPractitioner.has(id)) byPractitioner.set(id, []);
  }
  // No appointments and no known practitioner roster at all — nothing to
  // group, but callers below still need at least one (empty) bucket to
  // treat the day as simply free rather than vacuously "full".
  if (byPractitioner.size === 0) return [[]];
  return [...byPractitioner.values()].map(busyRangesFor);
}

// Verde en cuanto *ningún* profesional tiene el día completo, naranja en
// cuanto *alguno* lo tiene completo pero no todos (p.ej. un médico lleno y
// el otro con huecos), rojo solo cuando *todos* lo tienen completo, gris
// cuando la clínica no atiende ese día (cerrado o vacaciones — sin tramos
// configurados). Con un solo profesional en juego (ya filtrado a uno
// concreto) "naranja" nunca puede darse — solo tiene sentido en la vista
// agregada de "Todos los profesionales". Se mide contra las horas
// *abiertas* de la clínica, no un recuento de citas — una cita larga llena
// un tramo tanto como varias cortas. Las citas canceladas liberan su hueco
// y no cuentan; el resto (scheduled, completed, no_show) sigue contando
// como ocupado aunque ya haya pasado.
export function computeDayOccupancy(
  date: Date,
  appointmentsThatDay: OccupancyAppointment[],
  schedule: Schedule,
  practitionerIds?: string[],
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

  let anyFull = false;
  let anyFree = false;
  for (const busyRanges of groupByPractitioner(appointmentsThatDay, practitionerIds)) {
    let busyWithinOpenMinutes = 0;
    for (const open of openRanges) {
      for (const busy of busyRanges) {
        busyWithinOpenMinutes += overlapMinutes(open, busy);
      }
    }
    if (busyWithinOpenMinutes < openMinutes) {
      anyFree = true;
    } else {
      anyFull = true;
    }
  }
  if (anyFull && anyFree) return "partial";
  return anyFull ? "full" : "free";
}

// The core of both "free slots" scanners below. Finds the earliest start
// time >= cursor (and leaving room for `duration` minutes before tramoEnd)
// at which *some* practitioner's calendar is free — jumping straight to
// the moment a conflicting appointment ends instead of advancing by a
// fixed step. That distinction matters once appointment durations are
// irregular (10, 15, 30 min depending on the profesional): a fixed-step
// scan can only ever land on multiples of that step from the tramo's own
// start, so a 10-minute cita at 09:00 made 09:10 invisible to a 30-minute
// stepper — it would skip straight to 09:30 even though 09:10 was free the
// whole time. Returns null if nothing starts at or before tramoEnd — a
// cita may start exactly at closing time and run past it (same rule as
// AppointmentsService.assertWithinClinicHours on the backend), it just
// can't start any later.
function nextFreeStart(
  cursor: number,
  duration: number,
  tramoEnd: number,
  busyRangesByPractitioner: MinuteRange[][],
): number | null {
  while (cursor <= tramoEnd) {
    const candidate = { start: cursor, end: cursor + duration };
    let earliestConflictEnd: number | null = null;
    let anyoneFree = false;
    for (const busyRanges of busyRangesByPractitioner) {
      const conflicts = busyRanges.filter((busy) => overlapMinutes(candidate, busy) > 0);
      if (conflicts.length === 0) {
        anyoneFree = true;
        break;
      }
      // Rare in practice (busyRanges is already merged/non-overlapping per
      // practitioner), but a wide enough `duration` could still span two of
      // their appointments at once — the later end is what actually frees
      // this practitioner up.
      const end = Math.max(...conflicts.map((busy) => busy.end));
      if (earliestConflictEnd === null || end < earliestConflictEnd) {
        earliestConflictEnd = end;
      }
    }
    if (anyoneFree) return cursor;
    // Every practitioner was busy at `cursor` — jump to whichever of them
    // frees up soonest and re-check from there, rather than creeping
    // forward one step at a time.
    cursor = earliestConflictEnd ?? cursor + duration;
  }
  return null;
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
//
// slotMinutes is the length of appointment this is hunting gaps for, not a
// fixed display grid — callers without one specific cita in mind (this
// popover isn't tied to a particular profesional/duración) should pass the
// clinic's own configured default (Configuración → Citas), not a hardcoded
// 30: a clinic whose profesionales mostly book 10-15 minute citas would
// otherwise have real free time hidden behind a 30-minute-grid blind spot.
export function computeDayFreeSlots(
  date: Date,
  appointmentsThatDay: OccupancyAppointment[],
  schedule: Schedule,
  slotMinutes = 30,
  practitionerIds?: string[],
): string[] {
  const daySchedule = schedule.days.find((d) => d.weekday === weekdayOf(date));
  if (!daySchedule || daySchedule.slots.length === 0) return [];

  const now = new Date();
  // Derived from the clinic's own calendar day, not the executing process's
  // — this can run server-side during SSR on Vercel (UTC), where "today"
  // near midnight Madrid time would otherwise be off by a day.
  const todayKey = clinicDateInputValue(now.toISOString());
  const todayStart = new Date(`${todayKey}T00:00:00`);
  // A day already gone has no "free hours" in any bookable sense — without
  // this, a fully-past day would wrongly list its whole schedule as open
  // (only *today* gets clamped to the current time below).
  if (date < todayStart) return [];

  // One list of busy ranges per practitioner (see groupByPractitioner) — a
  // slot is bookable if *any* of them is free then, same "Todos los
  // profesionales is a union, not a shared calendar" fix as
  // computeDayOccupancy above.
  const busyRangesByPractitioner = groupByPractitioner(appointmentsThatDay, practitionerIds);

  const isToday = toDateKey(date) === todayKey;
  const nowMinutes = isToday
    ? Math.ceil(clinicMinutesOfDay(now.toISOString()) / slotMinutes) * slotMinutes
    : 0;

  const slots: string[] = [];
  for (const openSlot of daySchedule.slots) {
    const openEnd = timeToMinutes(openSlot.endTime);
    let cursor = Math.max(timeToMinutes(openSlot.startTime), nowMinutes);
    for (;;) {
      const start = nextFreeStart(cursor, slotMinutes, openEnd, busyRangesByPractitioner);
      if (start === null) break;
      slots.push(minutesToTime(start));
      cursor = start + slotMinutes;
    }
  }
  return slots;
}

// Shared by both calendars that color days by occupancy (Agenda's
// OccupancyCalendar and Escritorio's AgendaCalendar) — one source of truth
// for the verde/rojo/gris palette and its legend labels, so the two
// calendars can't drift out of sync with each other.
export const OCCUPANCY_STYLES: Record<DayOccupancy, string> = {
  // Same emerald/orange/red/gray families as the legend's swatch dots
  // below, but as a pale tint (100 bg / 700 text) rather than a solid
  // 400 fill — a whole calendar cell filled solid read as too heavy, a
  // small legend dot doesn't have that problem.
  free: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
  partial: "bg-orange-100 text-orange-700 hover:bg-orange-200",
  full: "bg-red-100 text-red-700 hover:bg-red-200",
  closed: "bg-gray-100 text-gray-700 hover:bg-gray-200",
};

export const OCCUPANCY_LEGEND: { key: DayOccupancy; label: string; swatch: string }[] = [
  { key: "free", label: "Disponible", swatch: "bg-emerald-400" },
  { key: "partial", label: "Algún profesional completo", swatch: "bg-orange-400" },
  { key: "full", label: "Completo", swatch: "bg-red-400" },
  { key: "closed", label: "Cerrado", swatch: "bg-gray-300" },
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
// horarios libres" suggestions in AppointmentForm — unlike
// computeDayOccupancy/computeDayFreeSlots above, this never needs the
// per-practitioner union: AppointmentForm only ever calls it once a
// specific practitioner is already picked (or is auto-scoped to a
// profesional caller server-side), so `appointmentsByDay` here is always
// already just that one practitioner's own appointments.
//
// slotMinutes should be the Duración the person is actually about to book
// — AppointmentForm passes its own Duración field, kept in sync by its own
// effect. A 10-minute cita searches for (and finds) genuinely 10-minute
// gaps, landing suggestions on whatever minute the previous cita actually
// ends at instead of only ever offering :00/:30.
export function findNextFreeSlots(
  from: Date,
  appointmentsByDay: Map<string, OccupancyAppointment[]>,
  schedule: Schedule,
  { slotMinutes = 30, count = 5, daysAhead = 14 }: FreeSlotOptions = {},
): Date[] {
  const slots: Date[] = [];
  // Both derived from the clinic's own calendar day/clock, not the
  // executing process's — `from` can be "now" computed server-side during
  // SSR on Vercel (UTC), where the wrong day/hour would shift every
  // suggested slot by the clinic's UTC offset. searchStartDay itself stays
  // a plain process-local Date used only for day-by-day arithmetic
  // (.setDate/.getDate never touch its hour), so building it from the
  // Madrid-derived key is enough to keep it correct end to end.
  const searchStartKey = clinicDateInputValue(from.toISOString());
  const searchStartDay = new Date(`${searchStartKey}T00:00:00`);
  const nowMinutesOnStartDay = clinicMinutesOfDay(from.toISOString());

  for (let dayOffset = 0; dayOffset <= daysAhead && slots.length < count; dayOffset++) {
    const day = new Date(searchStartDay);
    day.setDate(day.getDate() + dayOffset);
    const dayKey = toDateKey(day);
    const daySchedule = schedule.days.find((d) => d.weekday === weekdayOf(day));
    if (!daySchedule || daySchedule.slots.length === 0) continue;

    const busyRanges = mergeRanges(
      (appointmentsByDay.get(dayKey) ?? [])
        .filter((a) => a.status !== "cancelled")
        .map((a) => {
          const startMinutes = clinicMinutesOfDay(a.scheduledAt);
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
      while (slots.length < count) {
        const start = nextFreeStart(cursor, slotMinutes, openEnd, [busyRanges]);
        if (start === null) break;
        slots.push(new Date(clinicLocalToUtcIso(dayKey, minutesToTime(start))));
        cursor = start + slotMinutes;
      }
    }
  }

  return slots;
}
