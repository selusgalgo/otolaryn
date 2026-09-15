"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { NewAppointmentDialog } from "@/components/appointments/new-appointment-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getMonthAppointmentsAction } from "@/lib/actions/appointments";
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
import { cn } from "@/lib/utils";

interface OccupancyCalendarProps {
  initialYear: number;
  initialMonth: number; // 0-indexed, JS Date convention
  initialAppointments: CalendarAppointment[];
  schedule: Schedule;
  selectedDateKey?: string;
  practitioners?: PractitionerOption[] | null;
}

function formatDayHeading(date: Date): string {
  const label = date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

// Agenda's calendar: same navigable month grid as Escritorio's
// AgendaCalendar, but each day is colored by how full it is (against the
// clinic's configured hours) instead of showing a dot. Today or a future
// in-month day opens a popover of that day's free hours on click — pick one
// to jump straight into "Nueva cita" with the date and time already filled;
// a link inside the popover still reaches the old "ver citas de este día"
// table filter. A past or adjacent-month day has nothing to book, so it
// keeps the old click-to-filter behavior instead of a popover.
export function OccupancyCalendar({
  initialYear,
  initialMonth,
  initialAppointments,
  schedule,
  selectedDateKey,
  practitioners,
}: OccupancyCalendarProps) {
  const router = useRouter();
  const today = new Date();
  const todayKey = toDateKey(today);
  // Date-only, local midnight — comparing against cell.date (also local
  // midnight, see buildGrid) so "today" itself never counts as past.
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [appointments, setAppointments] = useState(initialAppointments);
  const [loading, setLoading] = useState(false);
  // "" = Todos los profesionales (aggregate, the calendar's original
  // behavior) — only admin/recepcion get this filter at all (see the
  // <select> below); a profesional is already scoped to themselves
  // server-side regardless of what's fetched here.
  const [selectedPractitionerId, setSelectedPractitionerId] = useState("");
  // Which day's popover is open — at most one at a time, keyed by
  // toDateKey. Also doubles as the anchor for the quick-book dialog: once
  // an hour is picked, quickBook carries {date, time} and this is cleared.
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);
  const [quickBook, setQuickBook] = useState<{ date: string; time: string } | null>(null);

  async function goToMonth(year: number, month: number, practitionerId = selectedPractitionerId) {
    setViewYear(year);
    setViewMonth(month);
    setLoading(true);
    try {
      setAppointments(await getMonthAppointmentsAction(year, month, practitionerId || undefined));
    } finally {
      setLoading(false);
    }
  }

  function shiftMonth(delta: number) {
    let month = viewMonth + delta;
    let year = viewYear;
    if (month < 0) {
      month = 11;
      year -= 1;
    } else if (month > 11) {
      month = 0;
      year += 1;
    }
    void goToMonth(year, month);
  }

  function changePractitioner(practitionerId: string) {
    setSelectedPractitionerId(practitionerId);
    setOpenDayKey(null);
    void goToMonth(viewYear, viewMonth, practitionerId);
  }

  const grid = buildGrid(viewYear, viewMonth);
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

  const monthLabel = formatMonthLabel(viewYear, viewMonth);

  return (
    <Card>
      <CardContent className="px-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Mes anterior"
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <span className="text-sm font-medium">{monthLabel}</span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Mes siguiente"
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
        {/* admin/recepcion only — a profesional has no one else to filter
            by, and is already looking at just their own appointments. Free
            hours are always specific to one profesional (two people's
            schedules don't add up into a single "who's free" answer), so
            switching this re-fetches the whole calendar scoped to them. */}
        {practitioners != null && (
          <select
            value={selectedPractitionerId}
            onChange={(e) => changePractitioner(e.target.value)}
            className="mb-2 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-xs"
          >
            <option value="">Todos los profesionales</option>
            {practitioners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        <div className="grid grid-cols-7 gap-1 pb-1 text-center text-xs text-muted-foreground">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className={cn("grid grid-cols-7 gap-1", loading && "opacity-50")}>
          {grid.map((cell) => {
            const key = toDateKey(cell.date);
            const isSelected = key === selectedDateKey;
            const isToday = key === todayKey;
            const isPast = cell.date < todayStart;
            // Past days read the same as adjacent-month days (muted, no
            // occupancy color) — a day that's already happened isn't
            // "libre"/"completo" in any actionable sense, so coloring it
            // just adds visual noise.
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
                <button
                  key={key}
                  type="button"
                  onClick={() => router.push(`/appointments?from=${key}&to=${key}`)}
                  className={dayButtonClassName}
                >
                  {cell.date.getDate()}
                </button>
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
                    href={`/appointments?from=${key}&to=${key}`}
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
        onCreated={() => void goToMonth(viewYear, viewMonth)}
      />
    </Card>
  );
}
