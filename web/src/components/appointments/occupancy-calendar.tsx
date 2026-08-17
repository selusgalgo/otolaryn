"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getMonthAppointmentsAction } from "@/lib/actions/appointments";
import type { CalendarAppointment } from "@/lib/actions/appointments";
import { WEEKDAYS, buildGrid, toDateKey } from "@/lib/calendar-grid";
import { computeDayOccupancy } from "@/lib/occupancy";
import type { DayOccupancy } from "@/lib/occupancy";
import type { Schedule } from "@/lib/types";
import { cn } from "@/lib/utils";

const OCCUPANCY_STYLES: Record<DayOccupancy, string> = {
  // Reuses the same tokens as AppointmentStatusBadge (--success/--destructive)
  // for verde/rojo; "parcial" has no themed token yet, so it's a plain amber.
  free: "bg-success/20 hover:bg-success/30",
  partial: "bg-amber-400/25 hover:bg-amber-400/35",
  full: "bg-destructive/20 hover:bg-destructive/30",
  closed: "bg-muted/50 text-muted-foreground/60",
};

const LEGEND: { key: DayOccupancy; label: string; swatch: string }[] = [
  { key: "free", label: "Libre", swatch: "bg-success" },
  { key: "partial", label: "Parcial", swatch: "bg-amber-400" },
  { key: "full", label: "Completo", swatch: "bg-destructive" },
  { key: "closed", label: "Cerrado", swatch: "bg-muted-foreground/40" },
];

interface OccupancyCalendarProps {
  initialYear: number;
  initialMonth: number; // 0-indexed, JS Date convention
  initialAppointments: CalendarAppointment[];
  schedule: Schedule;
  selectedDateKey?: string;
}

// Agenda's calendar: same navigable month grid as Escritorio's
// AgendaCalendar, but each day is colored by how full it is (against the
// clinic's configured hours) instead of showing a dot, and clicking a day
// doesn't open a side panel — it re-filters the table below via
// ?from=&to=, the same query params the existing date-range form already
// reads (see AppointmentsPage).
export function OccupancyCalendar({
  initialYear,
  initialMonth,
  initialAppointments,
  schedule,
  selectedDateKey,
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

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });

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
            // Past days read the same as adjacent-month days (muted, no
            // occupancy color) — a day that's already happened isn't
            // "libre"/"completo" in any actionable sense, so coloring it
            // just adds visual noise. Still clickable, same as any other day.
            const showOccupancy = cell.inMonth && !isPast;
            const occupancy = computeDayOccupancy(cell.date, appointmentsByDay.get(key) ?? [], schedule);
            return (
              <button
                key={key}
                type="button"
                onClick={() => router.push(`/appointments?from=${key}&to=${key}`)}
                title={showOccupancy ? LEGEND.find((l) => l.key === occupancy)?.label : undefined}
                className={cn(
                  "rounded-md py-1.5 text-sm transition-colors",
                  !showOccupancy && "text-muted-foreground/40",
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
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {LEGEND.map((item) => (
            <span key={item.key} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", item.swatch)} />
              {item.label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
