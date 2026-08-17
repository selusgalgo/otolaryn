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
import type { PractitionerOption } from "@/lib/practitioners";
import { cn } from "@/lib/utils";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

interface AgendaCalendarProps {
  initialYear: number;
  initialMonth: number; // 0-indexed, JS Date convention
  initialAppointments: CalendarAppointment[];
  practitioners?: PractitionerOption[] | null;
}

// Escritorio's agenda widget: a navigable mini-calendar (dot under any day
// with at least one appointment, selected day highlighted) next to a
// "Programado para <día>" list for whichever day is selected. Only the
// visible month's appointments are ever fetched — see
// getMonthAppointmentsAction — so switching months is one round trip, not a
// full page reload.
export function AgendaCalendar({
  initialYear,
  initialMonth,
  initialAppointments,
  practitioners,
}: AgendaCalendarProps) {
  const today = new Date();
  const todayKey = toDateKey(today);

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
  const daysWithAppointments = new Set(appointments.map((a) => toDateKey(new Date(a.scheduledAt))));
  const dayAppointments = appointments
    .filter((a) => toDateKey(new Date(a.scheduledAt)) === selectedDateKey)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

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
              const hasAppointments = daysWithAppointments.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectDay(cell)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-full py-1 text-sm transition-colors",
                    !cell.inMonth && "text-muted-foreground/40",
                    cell.inMonth && !isSelected && "text-foreground hover:bg-muted",
                    isSelected && "bg-primary text-primary-foreground",
                    !isSelected && isToday && "ring-1 ring-inset ring-primary",
                  )}
                >
                  <span>{cell.date.getDate()}</span>
                  <span
                    className={cn(
                      "size-1 rounded-full",
                      hasAppointments ? (isSelected ? "bg-primary-foreground" : "bg-primary") : "bg-transparent",
                    )}
                  />
                </button>
              );
            })}
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
        <CardContent>
          {dayAppointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin citas para este día.</p>
          ) : (
            <div className="space-y-2">
              {dayAppointments.map((appointment) => (
                <Link
                  key={appointment.id}
                  href={`/appointments/${appointment.id}`}
                  className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm hover:bg-muted/50"
                >
                  <span className="font-medium">{appointment.patientName}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">{formatTime(appointment.scheduledAt)}</span>
                    <AppointmentStatusBadge status={appointment.status} />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
