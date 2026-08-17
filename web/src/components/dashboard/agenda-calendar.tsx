"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppointmentStatusBadge } from "@/components/appointments/appointment-status-badge";
import { NewAppointmentDialog } from "@/components/appointments/new-appointment-dialog";
import { getMonthAppointmentsAction } from "@/lib/actions/appointments";
import type { CalendarAppointment } from "@/lib/actions/appointments";
import { WEEKDAYS, buildGrid, parseDateKey, toDateKey } from "@/lib/calendar-grid";
import type { DayCell } from "@/lib/calendar-grid";
import { OCCUPANCY_LEGEND, OCCUPANCY_STYLES, computeDayOccupancy } from "@/lib/occupancy";
import type { PractitionerOption } from "@/lib/practitioners";
import type { Schedule } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

// Common Spain convention, not tied to the clinic's actual tramos (those
// can be any two times, or more than two) — good enough to split the day's
// list into "Mañana"/"Tarde" without needing per-day schedule lookups here.
const AFTERNOON_START_HOUR = 14;

function AppointmentRow({ appointment }: { appointment: CalendarAppointment }) {
  return (
    <Link
      href={`/appointments/${appointment.id}`}
      className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm hover:bg-muted/50"
    >
      <span className="font-medium">{appointment.patientName}</span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-muted-foreground">{formatTime(appointment.scheduledAt)}</span>
        <AppointmentStatusBadge status={appointment.status} />
      </span>
    </Link>
  );
}

interface AgendaCalendarProps {
  initialYear: number;
  initialMonth: number; // 0-indexed, JS Date convention
  initialAppointments: CalendarAppointment[];
  practitioners?: PractitionerOption[] | null;
  schedule: Schedule;
}

// Escritorio's agenda widget: a navigable mini-calendar next to a
// "Programado para <día>" list for whichever day is selected. Only the
// visible month's appointments are ever fetched — see
// getMonthAppointmentsAction — so switching months is one round trip, not a
// full page reload. Days are colored by occupancy exactly like Agenda's
// OccupancyCalendar (same verde/amarillo/naranja/rojo/gris palette, same
// computeDayOccupancy) — see lib/occupancy.ts, the shared source of truth
// for both. Past days are additionally disabled here (not just muted): this
// widget's whole purpose is picking a day to book, and a day that's already
// gone isn't a valid pick — Agenda's calendar keeps past days clickable
// instead, since it's used to browse history too.
export function AgendaCalendar({
  initialYear,
  initialMonth,
  initialAppointments,
  practitioners,
  schedule,
}: AgendaCalendarProps) {
  const today = new Date();
  const todayKey = toDateKey(today);
  // Date-only, local midnight — comparing against cell.date (also local
  // midnight, see buildGrid) so "today" itself never counts as past.
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [appointments, setAppointments] = useState(initialAppointments);
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [loading, setLoading] = useState(false);

  async function goToMonth(year: number, month: number) {
    setViewYear(year);
    setViewMonth(month);
    setLoading(true);
    try {
      setAppointments(await getMonthAppointmentsAction(year, month));
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

  function selectDay(cell: DayCell) {
    setSelectedDateKey(toDateKey(cell.date));
    if (!cell.inMonth) {
      void goToMonth(cell.date.getFullYear(), cell.date.getMonth());
    }
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
  const dayAppointments = appointments
    .filter((a) => toDateKey(new Date(a.scheduledAt)) === selectedDateKey)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const morningAppointments = dayAppointments.filter(
    (a) => new Date(a.scheduledAt).getHours() < AFTERNOON_START_HOUR,
  );
  const afternoonAppointments = dayAppointments.filter(
    (a) => new Date(a.scheduledAt).getHours() >= AFTERNOON_START_HOUR,
  );

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });
  const agendaLabel =
    selectedDateKey === todayKey
      ? "Programado para hoy"
      : `Programado para el ${parseDateKey(selectedDateKey).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}`;

  return (
    <div className="grid gap-4 md:grid-cols-[300px_1fr]">
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
            <span className="text-sm font-medium capitalize">{monthLabel}</span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Mes siguiente"
              className="rounded p-1 text-muted-foreground hover:bg-muted"
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </div>
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
              const showOccupancy = cell.inMonth && !isPast;
              const occupancy = computeDayOccupancy(cell.date, appointmentsByDay.get(key) ?? [], schedule);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={isPast}
                  onClick={() => selectDay(cell)}
                  title={showOccupancy ? OCCUPANCY_LEGEND.find((l) => l.key === occupancy)?.label : undefined}
                  className={cn(
                    "rounded-md py-1.5 text-sm transition-colors",
                    isPast && "cursor-not-allowed text-muted-foreground/30",
                    !isPast && !showOccupancy && "text-muted-foreground/40",
                    showOccupancy && OCCUPANCY_STYLES[occupancy],
                    isSelected && "ring-2 ring-inset ring-primary",
                    !isSelected && isToday && "ring-1 ring-inset ring-primary/60",
                  )}
                >
                  {cell.date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {OCCUPANCY_LEGEND.map((item) => (
              <span key={item.key} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-full", item.swatch)} />
                {item.label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{agendaLabel}</CardTitle>
          <NewAppointmentDialog
            practitioners={practitioners}
            defaultDate={selectedDateKey}
            triggerLabel="Crear"
            onCreated={() => void goToMonth(viewYear, viewMonth)}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          {dayAppointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin citas para este día.</p>
          ) : (
            <>
              {morningAppointments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Mañana</p>
                  <div className="space-y-2">
                    {morningAppointments.map((appointment) => (
                      <AppointmentRow key={appointment.id} appointment={appointment} />
                    ))}
                  </div>
                </div>
              )}
              {afternoonAppointments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Tarde</p>
                  <div className="space-y-2">
                    {afternoonAppointments.map((appointment) => (
                      <AppointmentRow key={appointment.id} appointment={appointment} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
