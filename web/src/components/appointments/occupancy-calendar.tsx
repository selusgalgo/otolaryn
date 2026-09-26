"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { NewAppointmentDialog } from "@/components/appointments/new-appointment-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CalendarAppointment } from "@/lib/actions/appointments";
import { WEEKDAYS, buildGrid, formatMonthLabel, parseDateKey, toDateKey } from "@/lib/calendar-grid";
import {
  OCCUPANCY_LEGEND,
  OCCUPANCY_STYLES,
  computeDayFreeSlots,
  computeDayOccupancy,
} from "@/lib/occupancy";
import type { PractitionerOption } from "@/lib/practitioners";
import type { Schedule } from "@/lib/types";
import { cn, splitName } from "@/lib/utils";

interface OccupancyCalendarProps {
  year: number;
  month: number; // 0-indexed, JS Date convention
  appointments: CalendarAppointment[];
  // Always every profesional's appointments for the month, regardless of
  // practitionerId below — `appointments` itself is server-scoped to
  // whichever profesional is currently selected (or everyone, under
  // "Todos"), which is exactly right for the calendar's own day coloring
  // but wrong for the per-profesional dots in the side panel: those need
  // to judge each profesional on their own appointments even while the
  // main view is filtered down to just one other person.
  allAppointments: CalendarAppointment[];
  schedule: Schedule;
  selectedDateKey?: string;
  practitioners?: PractitionerOption[] | null;
  // Current filter, mirrored from the URL (see appointments/page.tsx) — the
  // calendar itself *is* the filter: switching month or clicking a day
  // navigates to a new from/to instead of only redrawing this component.
  from: string;
  to?: string;
  practitionerId?: string;
  // Mirrors the URL's own "openDay" param (see appointments/page.tsx) — set
  // when a practitioner switch in the side panel carried over whichever
  // day's popover was open at the time, so that day reopens here instead
  // of the switch silently closing it.
  initialOpenDayKey?: string;
}

function formatDayHeading(date: Date): string {
  const label = date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

// Quick time-of-day narrowing for a day's free-slots popover — generic
// fixed bands, same idea as Booksy's Mañana/Mediodía/Tarde chips, not tied
// to any one tenant's configured tramos (a clinic with a 13:00-16:00 break
// simply has nothing under "Mediodía" most of the time, same as it would
// show no slots there today).
type TimeOfDay = "morning" | "midday" | "afternoon";

const TIME_OF_DAY_FILTERS: { key: TimeOfDay; label: string; from: number; to: number }[] = [
  { key: "morning", label: "Mañana", from: 0, to: 12 * 60 },
  { key: "midday", label: "Mediodía", from: 12 * 60, to: 16 * 60 },
  { key: "afternoon", label: "Tarde", from: 16 * 60, to: 24 * 60 },
];

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// Agenda's calendar: same navigable month grid as Escritorio's
// AgendaCalendar, but each day is colored by how full it is (against the
// clinic's configured hours) instead of showing a dot, and it doubles as
// the appointments list's own filter — switching month or clicking a day
// navigates, it doesn't just redraw locally. Today or a future in-month day
// opens a popover of that day's free hours on click — pick one to jump
// straight into "Nueva cita" with the date and time already filled; a link
// inside the popover still reaches the "ver citas de este día" filter. A
// past or adjacent-month day has nothing to book, so it's a plain link to
// that filter instead of a popover.
export function OccupancyCalendar({
  year,
  month,
  appointments,
  allAppointments,
  schedule,
  selectedDateKey,
  practitioners,
  from,
  to,
  practitionerId,
  initialOpenDayKey,
}: OccupancyCalendarProps) {
  const today = new Date();
  const todayKey = toDateKey(today);
  // Date-only, local midnight — comparing against cell.date (also local
  // midnight, see buildGrid) so "today" itself never counts as past.
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // "" = Todos los profesionales.
  const selectedPractitionerId = practitionerId ?? "";
  // Only meaningful for the "Todos" aggregate view — computeDayOccupancy/
  // computeDayFreeSlots use it to treat each practitioner as their own
  // parallel calendar instead of one shared one (see occupancy.ts). Once a
  // specific practitioner is selected, `appointments` is already scoped to
  // just them server-side, so there's nothing to union.
  const allPractitionerIds =
    selectedPractitionerId === "" ? practitioners?.map((p) => p.id) : undefined;
  // Which day's popover is open — at most one at a time, keyed by
  // toDateKey. Also doubles as the anchor for the quick-book dialog: once
  // an hour is picked, quickBook carries {date, time} and this is cleared.
  // Seeded from initialOpenDayKey (the URL's "openDay") rather than always
  // null, so switching profesional in the side panel — a full navigation,
  // which would otherwise silently close whatever day you had open — lands
  // back on that same day already open.
  const [openDayKey, setOpenDayKey] = useState<string | null>(initialOpenDayKey ?? null);
  // A practitioner switch is a Link, not a hard reload — Next's router
  // keeps this same component instance mounted and just hands it new
  // props, so useState's initializer above only ever ran once, back when
  // there was no "openDay" yet. Re-syncing here is what actually makes the
  // day reopen after switching. Depending on practitionerId too (not just
  // initialOpenDayKey) matters: clicking a profesional in the side panel is
  // itself an outside click on the open popover, which Radix's own
  // dismiss-on-outside-click already closes before this runs — if the day
  // being carried over happens to be the *same* one as last time (still
  // "2026-09-30", say), initialOpenDayKey wouldn't change and this
  // wouldn't re-fire to undo that dismissal.
  useEffect(() => {
    if (initialOpenDayKey) setOpenDayKey(initialOpenDayKey);
  }, [initialOpenDayKey, practitionerId]);
  const [quickBook, setQuickBook] = useState<{ date: string; time: string } | null>(null);
  // Shared across whichever day's popover is open — picking "Tarde" once
  // and then browsing to the next day keeps that same narrowing instead of
  // resetting it every time a different day is clicked.
  const [timeFilter, setTimeFilter] = useState<TimeOfDay | null>(null);

  function dayHref(dayKey: string): string {
    const qs = new URLSearchParams();
    qs.set("from", dayKey);
    qs.set("to", dayKey);
    if (selectedPractitionerId) qs.set("practitionerId", selectedPractitionerId);
    return `/appointments?${qs.toString()}`;
  }

  function practitionerHref(id: string): string {
    const qs = new URLSearchParams();
    qs.set("from", from);
    if (to) qs.set("to", to);
    if (id) qs.set("practitionerId", id);
    // Carries whichever day's popover is currently open across the switch
    // — see initialOpenDayKey above for the other half of this.
    if (openDayKey) qs.set("openDay", openDayKey);
    return `/appointments?${qs.toString()}`;
  }

  function monthHref(delta: number): string {
    let m = month + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    const qs = new URLSearchParams();
    qs.set("from", toDateKey(new Date(y, m, 1)));
    qs.set("to", toDateKey(new Date(y, m + 1, 0)));
    if (selectedPractitionerId) qs.set("practitionerId", selectedPractitionerId);
    return `/appointments?${qs.toString()}`;
  }

  const grid = buildGrid(year, month);
  const appointmentsByDay = new Map<string, CalendarAppointment[]>();
  for (const appointment of appointments) {
    const key = toDateKey(new Date(appointment.scheduledAt));
    const list = appointmentsByDay.get(key);
    if (list) {
      list.push(appointment);
    } else {
      appointmentsByDay.set(key, [appointment]);
    }
  }

  // Backs only the side panel's per-profesional dots — everything else in
  // this component keeps using appointmentsByDay above, which is correctly
  // scoped to whatever the current filter is.
  const allAppointmentsByDay = new Map<string, CalendarAppointment[]>();
  for (const appointment of allAppointments) {
    const key = toDateKey(new Date(appointment.scheduledAt));
    const list = allAppointmentsByDay.get(key);
    if (list) {
      list.push(appointment);
    } else {
      allAppointmentsByDay.set(key, [appointment]);
    }
  }

  const monthLabel = formatMonthLabel(year, month);

  // Which day each profesional's own dot (in the side panel below) reflects
  // — whichever day's popover is currently open, so the dots update live as
  // you click around the grid; failing that, whatever single day the page
  // is already filtered to; failing that, today. Falls back to "free" for
  // a day outside the currently displayed month (appointmentsByDay simply
  // has nothing for it), which only matters in the rare case of a
  // cross-month selectedDateKey.
  const activeDayKey = openDayKey ?? selectedDateKey ?? todayKey;
  const activeDate = parseDateKey(activeDayKey);

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_320px]">
      <Card>
        <CardContent className="px-3">
          <div className="mb-2 flex items-center justify-between">
            <Link
              href={monthHref(-1)}
              aria-label="Mes anterior"
              className="rounded p-1 text-muted-foreground hover:bg-muted"
            >
              <ChevronLeftIcon className="size-4" />
            </Link>
            <span className="text-sm font-medium">{monthLabel}</span>
            <Link
              href={monthHref(1)}
              aria-label="Mes siguiente"
              className="rounded p-1 text-muted-foreground hover:bg-muted"
            >
              <ChevronRightIcon className="size-4" />
            </Link>
          </div>
          <div className="grid grid-cols-7 gap-1 pb-1 text-center text-xs text-muted-foreground">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell) => {
              const key = toDateKey(cell.date);
              const isSelected = key === selectedDateKey;
              const isToday = key === todayKey;
              const isPast = cell.date < todayStart;
              // Past days read the same as adjacent-month days (muted, no
              // occupancy color) — a day that's already happened isn't
              // "libre"/"completo" en ningún sentido accionable, así que
              // colorearlo solo añade ruido visual.
              const showOccupancy = cell.inMonth && !isPast;
              const occupancy = computeDayOccupancy(
                cell.date,
                appointmentsByDay.get(key) ?? [],
                schedule,
                allPractitionerIds,
              );
              const dayButtonClassName = cn(
                "w-full rounded-md py-1.5 text-sm transition-colors",
                !showOccupancy && "text-muted-foreground/40",
                showOccupancy && OCCUPANCY_STYLES[occupancy],
                isSelected && "ring-2 ring-inset ring-primary",
                !isSelected && isToday && "ring-1 ring-inset ring-primary/60",
              );

              // No hours to book on a day that's already gone or outside the
              // visible month — same click-to-filter shortcut this calendar
              // always had, instead of a popover with nothing useful in it.
              if (!showOccupancy) {
                return (
                  <Link key={key} href={dayHref(key)} className={cn(dayButtonClassName, "text-center")}>
                    {cell.date.getDate()}
                  </Link>
                );
              }

              const freeSlots = computeDayFreeSlots(
                cell.date,
                appointmentsByDay.get(key) ?? [],
                schedule,
                30,
                allPractitionerIds,
              );

              return (
                <Popover
                  key={key}
                  open={openDayKey === key}
                  onOpenChange={(next) => setOpenDayKey(next ? key : null)}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      title={OCCUPANCY_LEGEND.find((l) => l.key === occupancy)?.label}
                      className={dayButtonClassName}
                    >
                      {cell.date.getDate()}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64">
                    <p className="mb-2 text-sm font-medium">{formatDayHeading(cell.date)}</p>
                    {occupancy === "closed" ? (
                      <p className="text-sm text-muted-foreground">La clínica no atiende este día.</p>
                    ) : freeSlots.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No quedan huecos libres este día.</p>
                    ) : (
                      <>
                        <div className="mb-2 flex gap-1.5">
                          {TIME_OF_DAY_FILTERS.map((f) => (
                            <button
                              key={f.key}
                              type="button"
                              onClick={() => setTimeFilter(timeFilter === f.key ? null : f.key)}
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                                timeFilter === f.key
                                  ? "border-primary bg-primary/5 text-primary"
                                  : "border-input hover:bg-muted",
                              )}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>
                        {(() => {
                          const activeFilter = TIME_OF_DAY_FILTERS.find((f) => f.key === timeFilter);
                          const visibleSlots = activeFilter
                            ? freeSlots.filter(
                                (time) => minutesOf(time) >= activeFilter.from && minutesOf(time) < activeFilter.to,
                              )
                            : freeSlots;
                          return visibleSlots.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              Ningún hueco por {activeFilter?.label.toLowerCase()} este día.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {visibleSlots.map((time) => (
                                <button
                                  key={time}
                                  type="button"
                                  onClick={() => {
                                    setOpenDayKey(null);
                                    setQuickBook({ date: key, time });
                                  }}
                                  className="rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
                                >
                                  {time}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </>
                    )}
                    <Link
                      href={dayHref(key)}
                      className="mt-3 inline-block text-xs text-muted-foreground hover:underline"
                      onClick={() => setOpenDayKey(null)}
                    >
                      Ver citas de este día →
                    </Link>
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {OCCUPANCY_LEGEND.map((item) => (
              <span key={item.key} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-full", item.swatch)} />
                {item.label}
              </span>
            ))}
          </div>
        </CardContent>

        <NewAppointmentDialog
          practitioners={practitioners}
          defaultDate={quickBook?.date}
          defaultTime={quickBook?.time}
          // Only when a specific profesional is the active filter — under
          // "Todos" the slot was free for the whole clinic in aggregate, not
          // provably free for any one profesional in particular, so there's
          // no honest default to pre-fill and admin/recepcion still choose.
          defaultPractitionerId={selectedPractitionerId || undefined}
          open={quickBook !== null}
          onOpenChange={(next) => {
            if (!next) setQuickBook(null);
          }}
          hideTrigger
        />
      </Card>

      {/* admin/recepcion only — a profesional has no one else to filter by,
          and is already looking at just their own appointments. Free hours
          are always specific to one profesional (two people's schedules
          don't add up into a single "who's free" answer), so switching this
          navigates to a new filter — re-fetching the calendar AND the
          appointments list below, both driven by the same URL. A side
          column next to the calendar (Booksy's layout) instead of a row of
          chips above it — each profesional's dot is that same
          computeDayOccupancy the grid itself uses, just scoped to their own
          appointments alone, for whichever day is "active" right now (see
          activeDayKey above) — never "partial", since a single person's
          agenda is either free or full, that state only exists in
          aggregate. */}
      {practitioners != null && (
        <Card className="h-fit">
          <CardContent className="space-y-1.5 p-3">
            <Link
              href={practitionerHref("")}
              className={cn(
                "block rounded-lg border px-3 py-2 text-sm transition-colors",
                selectedPractitionerId === ""
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-input bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              Todos los profesionales
            </Link>
            {practitioners.map((p) => {
              const { firstName, lastName } = splitName(p.label);
              const active = selectedPractitionerId === p.id;
              const dotStatus = computeDayOccupancy(
                activeDate,
                (allAppointmentsByDay.get(activeDayKey) ?? []).filter(
                  (a) => a.practitionerId === p.id,
                ),
                schedule,
              );
              return (
                <Link
                  key={p.id}
                  href={practitionerHref(p.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border py-1.5 pr-3 pl-1.5 text-sm transition-colors",
                    active
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input bg-background hover:bg-muted",
                  )}
                >
                  <InitialsAvatar firstName={firstName} lastName={lastName} size="sm" />
                  <span className="flex-1 truncate">{p.label}</span>
                  <span
                    title={OCCUPANCY_LEGEND.find((l) => l.key === dotStatus)?.label}
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      OCCUPANCY_LEGEND.find((l) => l.key === dotStatus)?.swatch,
                    )}
                  />
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
