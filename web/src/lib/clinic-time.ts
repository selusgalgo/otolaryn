// Single source of truth for turning a "date"+"time" pair the way a person
// in the clinic means it (Europe/Madrid wall-clock time) into the UTC
// instant that actually represents, and back again for display/pre-fill —
// mirrors the backend's own CLINIC_TIME_ZONE handling in
// appointments.service.ts (weekdayAndMinutesInClinicTimeZone), which exists
// for exactly the same reason spelled out there:
//
// `new Date(`${date}T${time}`).toISOString()` (what every one of these call
// sites used to do) parses the string as local time *of whatever process
// runs it* — the viewer's browser for a client component, but UTC for a
// Vercel serverless function. A profesional/admin typing "09:00" from a
// Server Action therefore got it stored as 09:00 UTC, which the backend's
// (correctly Madrid-aware) horario check and the Agenda calendar's busy-time
// math both then read back as 11:00 Europe/Madrid in summer (CEST, UTC+2) —
// the appointment "at 9:00" silently occupied the 11:00 slot instead, while
// the list kept showing "9:00" because *that* display also formatted in
// whatever zone happened to render it. Every function here goes through
// Intl's IANA tz database instead, so it's correct across the CET/CEST
// switch and regardless of where the code executes.
export const CLINIC_TIME_ZONE = "Europe/Madrid";

interface ClinicTimeParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

function partsInClinicTimeZone(instant: Date): ClinicTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

// The clinic's UTC offset (in minutes, e.g. 120 for CEST) at the given
// instant — derived by asking Intl what Europe/Madrid's wall clock reads
// then, rather than hardcoding it, so CET/CEST transitions resolve
// themselves automatically.
function offsetMinutesAt(instant: Date): number {
  const p = partsInClinicTimeZone(instant);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return (asIfUtc - instant.getTime()) / 60000;
}

// Converts a native "YYYY-MM-DD" date input value and "HH:MM" time input
// value — both meant as Europe/Madrid wall-clock time — into the UTC instant
// they represent, as an ISO string ready to send the API as `scheduledAt`.
export function clinicLocalToUtcIso(date: string, time: string): string {
  // A first guess that treats the wall-clock numbers as if they were UTC —
  // off from the real instant by exactly the clinic's UTC offset, which is
  // always a whole number of hours for Europe/Madrid (no half-hour DST here),
  // so correcting for it in one step is exact.
  const naiveUtc = new Date(`${date}T${time}:00.000Z`);
  const offsetMinutes = offsetMinutesAt(naiveUtc);
  return new Date(naiveUtc.getTime() - offsetMinutes * 60000).toISOString();
}

// The reverse of clinicLocalToUtcIso's date half — pre-fills a native
// <input type="date"> with the clinic-local calendar day an appointment
// falls on, instead of toDateInputValue's old `d.getFullYear()`/etc (which
// read the *viewer's* local day, wrong for anyone outside Europe/Madrid and
// a mismatch with how the value gets sent back on save).
export function clinicDateInputValue(iso: string): string {
  const p = partsInClinicTimeZone(new Date(iso));
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// The reverse of clinicLocalToUtcIso's time half — pre-fills a native
// <input type="time"> with the clinic-local hour:minute, same reasoning as
// clinicDateInputValue above.
export function clinicTimeInputValue(iso: string): string {
  const p = partsInClinicTimeZone(new Date(iso));
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

// Formats an ISO instant for display, always in the clinic's own timezone
// regardless of the viewer's or the rendering process's — a thin wrapper
// around toLocaleString so every appointment-facing display call is
// guaranteed to pass `timeZone`, rather than relying on each call site to
// remember to.
export function formatInClinicTimeZone(
  iso: string,
  options: Intl.DateTimeFormatOptions,
  locale = "es-ES",
): string {
  return new Date(iso).toLocaleString(locale, { ...options, timeZone: CLINIC_TIME_ZONE });
}

// Minutes since local midnight (Europe/Madrid) for an ISO instant — backs
// the Agenda calendar's busy/free math in occupancy.ts, which compares
// appointment times against the clinic's schedule (itself defined in
// clinic-local HH:MM). Replaces `date.getHours() * 60 + date.getMinutes()`,
// which reads the *viewer's* local time: correct only by coincidence for a
// Europe/Madrid-based viewer, and the same bug class as the write-side one
// above for anyone/anything else (a different timezone, a headless
// browser, CI).
export function clinicMinutesOfDay(iso: string): number {
  const p = partsInClinicTimeZone(new Date(iso));
  return p.hour * 60 + p.minute;
}
