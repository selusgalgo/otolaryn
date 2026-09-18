"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { NewAppointmentDialog } from "@/components/appointments/new-appointment-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CalendarAppointment } from "@/lib/actions/appointments";
import { WEEKDAYS, buildGrid, formatMonthLabel, toDateKey } from "@/lib/calendar-grid";
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
  schedule: Schedule;
  selectedDateKey?: string;
  practitioners?: PractitionerOption[] | null;
  // Current filter, mirrored from the URL (see appointments/page.tsx) — the
  // calendar itself *is* the filter: switching month or clicking a day
  // navigates to a new from/to instead of only redrawing this component.
  from: string;
  to?: string;
  practitionerId?: string;
}

function formatDayHeading(date: Date): string {
  const label = date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
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
  schedule,
  selectedDateKey,
  practitioners,
  from,
  to,
  practitionerId,
}: OccupancyCalendarProps) {
  const today = new Date();
  const todayKey = toDateKey(today);
  // Date-only, local midnight — comparing against cell.date (also local
  // midnight, see buildGrid) so "today" itself never counts as past.
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // "" = Todos los profesionales.
  const selectedPractitionerId = practitionerId ?? "";
  // Which day's popover is open — at most one at a time, keyed by
  // toDateKey. Also doubles as the anchor for the quick-book dialog: once
  // an hour is picked, quickBook carries {date, time} and this is cleared.
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);
  const [quickBook, setQuickBook] = useState<{ date: string; time: string } | null>(null);

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

  const monthLabel = formatMonthLabel(year, month);

  return (
    <div className="space-y-3">
      {/* admin/recepcion only — a profesional has no one else to filter by,
          and is already looking at just their own appointments. Free hours
          are always specific to one profesional (two people's schedules
          don't add up into a single "who's free" answer), so switching this
          navigates to a new filter — re-fetching the calendar AND the
          appointments list below, both driven by the same URL. Lives
          outside the calendar card, as its own row of avatar tags, instead
          of a dropdown squeezed inside it. */}
      {practitioners != null && (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={practitionerHref("")}
            className={cn(
              "flex items-center rounded-full border px-3 py-2.5 text-sm transition-colors",
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
            return (
              <Link
                key={p.id}
                href={practitionerHref(p.id)}
                className={cn(
                  "flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input bg-background hover:bg-muted",
                )}
              >
                <InitialsAvatar firstName={firstName} lastName={lastName} size="sm" />
                {p.label}
              </Link>
            );
          })}
        </div>
      )}

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
              const occupancy = computeDayOccupancy(cell.date, appointmentsByDay.get(key) ?? [], schedule);
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

              const freeSlots = computeDayFreeSlots(cell.date, appointmentsByDay.get(key) ?? [], schedule);

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
                      <div className="flex flex-wrap gap-1.5">
                        {freeSlots.map((time) => (
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
    </div>
  );
}
