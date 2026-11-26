"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PencilIcon, PlusIcon } from "@heroicons/react/24/outline";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { rescheduleAppointmentAction } from "@/lib/actions/appointments";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AppointmentStatusBadge } from "@/components/appointments/appointment-status-badge";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointment-status";
import { NewAppointmentDialog } from "@/components/appointments/new-appointment-dialog";
import {
  clinicDateInputValue,
  clinicMinutesOfDay,
  formatInClinicTimeZone,
} from "@/lib/clinic-time";
import { parseDateKey } from "@/lib/calendar-grid";
import type { PractitionerOption } from "@/lib/practitioners";
import type { Schedule } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  confirmDiscardUnsavedChanges,
  useUnsavedChangesWarning,
} from "@/lib/unsaved-changes";

export interface PeriodAppointment {
  id: string;
  patientName: string;
  scheduledAt: string;
  durationMinutes: number;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  practitionerId: string | null;
  practitionerName: string | null;
  practitionerHonorific: "Dr." | "Dra." | null;
}

interface AppointmentPeriodViewProps {
  view: "day" | "week";
  dateKey: string;
  todayKey: string;
  periodLabel: string;
  weekDateKeys: string[];
  appointments: PeriodAppointment[];
  schedule: Schedule;
  practitioners?: PractitionerOption[] | null;
  practitionerId?: string;
}

function formatTime(iso: string): string {
  return formatInClinicTimeZone(iso, { hour: "2-digit", minute: "2-digit" });
}

const STATUS_CARD_STYLES = {
  scheduled: "border-blue-300 bg-blue-50 text-blue-950 hover:bg-blue-100",
  completed:
    "border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100",
  cancelled:
    "border-red-300 border-dashed bg-red-50/80 text-red-950 hover:bg-red-100",
  no_show: "border-slate-300 bg-slate-100 text-slate-950 hover:bg-slate-200",
} as const;

function weekdayIndex(dateKey: string): number {
  return (parseDateKey(dateKey).getDay() + 6) % 7;
}

function formatDateHeading(dateKey: string): string {
  const value = parseDateKey(dateKey).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatHours(dateKey: string, schedule: Schedule): string | null {
  const slots =
    schedule.days.find((day) => day.weekday === weekdayIndex(dateKey))?.slots ??
    [];
  if (slots.length === 0) return null;
  return slots.map((slot) => slot.startTime + "–" + slot.endTime).join(" · ");
}

function CurrentTimeIndicator({
  label,
  top,
  left = 0,
}: {
  label: string;
  top: number;
  left?: number;
}) {
  return (
    <div
      role="img"
      aria-label={"Hora actual: " + label}
      className="pointer-events-none absolute right-0 z-20 border-t-2 border-red-500"
      style={{ top, left }}
    >
      <span
        aria-hidden="true"
        className="absolute -left-1.5 -top-[5px] size-2.5 rounded-full bg-red-500 ring-2 ring-background"
      />
      <span
        aria-hidden="true"
        className="absolute left-2 -top-3 rounded-sm bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-sm"
      >
        {label}
      </span>
    </div>
  );
}

function AppointmentEventCard({
  appointment,
  compact = false,
  showTime = true,
  showProfessional = true,
  fill = false,
  weekCard = false,
  shortCard = false,
}: {
  appointment: PeriodAppointment;
  compact?: boolean;
  showTime?: boolean;
  showProfessional?: boolean;
  fill?: boolean;
  weekCard?: boolean;
  shortCard?: boolean;
}) {
  const professional = appointment.practitionerName
    ? (appointment.practitionerHonorific
        ? appointment.practitionerHonorific + " "
        : "") + appointment.practitionerName
    : null;

  if (fill) {
    return (
      <Link
        href={"/appointments/" + appointment.id}
        aria-label={
          "Ver cita de " +
          appointment.patientName +
          " a las " +
          formatTime(appointment.scheduledAt) +
          ", " +
          APPOINTMENT_STATUS_LABELS[appointment.status] +
          ", " +
          appointment.durationMinutes +
          " minutos"
        }
        title={
          appointment.patientName +
          " · " +
          formatTime(appointment.scheduledAt) +
          " · " +
          APPOINTMENT_STATUS_LABELS[appointment.status] +
          " · " +
          appointment.durationMinutes +
          " min"
        }
        className={cn(
          "block h-full overflow-hidden rounded-md border px-2 text-xs leading-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          shortCard ? "flex items-center py-0" : "py-1",
          !weekCard && appointment.status === "scheduled" && "pr-16",
          STATUS_CARD_STYLES[appointment.status],
        )}
      >
        <div className="min-w-0">
          <div className="flex gap-1 font-medium">
            <span className="shrink-0 tabular-nums">
              {formatTime(appointment.scheduledAt)}
            </span>
            <span className="truncate">{appointment.patientName}</span>
          </div>
          {!shortCard && (
            <div className="truncate text-muted-foreground">
              {weekCard
                ? (professional ?? "Sin profesional")
                : APPOINTMENT_STATUS_LABELS[appointment.status] +
                  " · " +
                  appointment.durationMinutes +
                  " min"}
            </div>
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={"/appointments/" + appointment.id}
      aria-label={
        "Ver cita de " +
        appointment.patientName +
        " a las " +
        formatTime(appointment.scheduledAt)
      }
      className={cn(
        "block rounded-lg border border-border/70 bg-background transition-colors hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "px-2.5 py-2" : "px-3 py-2.5",
        fill && "h-full overflow-hidden",
      )}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-2",
          compact && "flex-col gap-0.5",
        )}
      >
        <span className="min-w-0 truncate font-medium">
          {appointment.patientName}
        </span>
        {showTime && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatTime(appointment.scheduledAt)}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <AppointmentStatusBadge status={appointment.status} />
        <span className="text-xs text-muted-foreground">
          {appointment.durationMinutes} min
        </span>
      </div>
      {showProfessional && professional && (
        <p className="mt-1.5 truncate text-xs text-muted-foreground">
          {professional}
        </p>
      )}
    </Link>
  );
}

export function AppointmentPeriodView({
  view,
  dateKey,
  todayKey,
  periodLabel,
  weekDateKeys,
  appointments,
  schedule,
  practitioners,
  practitionerId,
}: AppointmentPeriodViewProps) {
  const router = useRouter();
  const [currentInstant, setCurrentInstant] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<PeriodAppointment | null>(null);
  const [editTime, setEditTime] = useState("");
  const [editDuration, setEditDuration] = useState(30);
  const [editError, setEditError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState<PeriodAppointment | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    minute: number;
    valid: boolean;
  } | null>(null);
  const [moved, setMoved] = useState<{
    appointment: PeriodAppointment;
    newTime: string;
  } | null>(null);
  const [undoError, setUndoError] = useState("");
  const timeEditDirty =
    editing !== null &&
    (editTime !== formatTime(editing.scheduledAt) ||
      editDuration !== editing.durationMinutes);
  useUnsavedChangesWarning(timeEditDirty);
  const dragRef = useRef<{
    appointment: PeriodAppointment;
    offset: number;
  } | null>(null);
  useEffect(() => {
    const updateCurrentInstant = () =>
      setCurrentInstant(new Date().toISOString());
    updateCurrentInstant();
    const interval = window.setInterval(updateCurrentInstant, 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const openEdit = (appointment: PeriodAppointment) => {
    setEditTime(formatTime(appointment.scheduledAt));
    setEditDuration(appointment.durationMinutes);
    setEditError("");
    setEditing(appointment);
  };
  const closeTimeEditor = () => {
    if (pending || !confirmDiscardUnsavedChanges(timeEditDirty)) return;
    setEditing(null);
  };
  const saveTime = (
    appointment: PeriodAppointment,
    time: string,
    duration: number,
    fromDialog: boolean,
  ) => {
    setNotice("");
    setEditError("");
    startTransition(async () => {
      const result = await rescheduleAppointmentAction(
        appointment.id,
        dateKey,
        time,
        duration,
      );
      if (result.error) {
        if (fromDialog) setEditError(result.error);
        else setNotice("No se ha movido la cita: " + result.error);
        return;
      }
      setEditing(null);
      if (fromDialog)
        setNotice(
          `Cita de ${appointment.patientName} actualizada a las ${time}.`,
        );
      else {
        setUndoError("");
        setMoved({ appointment, newTime: time });
      }
      router.refresh();
    });
  };
  const [bookingDate, setBookingDate] = useState(dateKey);
  const [bookingTime, setBookingTime] = useState<string | undefined>();
  const [bookingPractitioner, setBookingPractitioner] = useState<
    string | undefined
  >(practitionerId);
  const [bookingOpen, setBookingOpen] = useState(false);
  const openBooking = (dayKey: string) => {
    setBookingDate(dayKey);
    setBookingTime(undefined);
    setBookingPractitioner(practitionerId);
    setBookingOpen(true);
  };
  const openSlotBooking = (time: number, doctorId: string) => {
    setBookingDate(dateKey);
    setBookingTime(
      `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`,
    );
    setBookingPractitioner(doctorId);
    setBookingOpen(true);
  };

  const appointmentByDay = new Map<string, PeriodAppointment[]>();
  for (const appointment of appointments) {
    const key = clinicDateInputValue(appointment.scheduledAt);
    const list = appointmentByDay.get(key);
    if (list) list.push(appointment);
    else appointmentByDay.set(key, [appointment]);
  }

  const visibleDays = view === "day" ? [dateKey] : weekDateKeys;
  const totalMinutes = appointments.reduce(
    (sum, appointment) =>
      sum +
      (appointment.status === "cancelled" ? 0 : appointment.durationMinutes),
    0,
  );
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  const durationLabel =
    totalHours > 0
      ? totalHours +
        " h" +
        (remainingMinutes > 0 ? " " + remainingMinutes + " min" : "")
      : remainingMinutes + " min";
  const dailyAppointments = appointmentByDay.get(dateKey) ?? [];
  const columns = new Map<
    string,
    { label: string; appointments: PeriodAppointment[] }
  >();
  for (const practitioner of practitioners ?? []) {
    if (!practitionerId || practitioner.id === practitionerId) {
      columns.set(practitioner.id, {
        label: practitioner.label,
        appointments: [],
      });
    }
  }
  for (const appointment of dailyAppointments) {
    const key = appointment.practitionerId ?? "unassigned";
    if (!columns.has(key)) {
      columns.set(key, {
        label: appointment.practitionerName
          ? [appointment.practitionerHonorific, appointment.practitionerName]
              .filter(Boolean)
              .join(" ")
          : "Sin profesional",
        appointments: [],
      });
    }
    columns.get(key)!.appointments.push(appointment);
  }
  const dayHours = formatHours(dateKey, schedule);
  const isClosed = dayHours === null;
  const slots =
    schedule.days.find((day) => day.weekday === weekdayIndex(dateKey))?.slots ??
    [];
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };
  const starts = [
    ...slots.map((slot) => toMinutes(slot.startTime)),
    ...dailyAppointments.map((a) => clinicMinutesOfDay(a.scheduledAt)),
  ];
  const ends = [
    ...slots.map((slot) => toMinutes(slot.endTime)),
    ...dailyAppointments.map(
      (a) => clinicMinutesOfDay(a.scheduledAt) + a.durationMinutes,
    ),
  ];
  const startMinute = Math.floor(Math.min(...starts, 540) / 60) * 60;
  const endMinute = Math.ceil(Math.max(...ends, 1020) / 60) * 60;
  const currentDateKey = currentInstant
    ? clinicDateInputValue(currentInstant)
    : null;
  const currentMinute = currentInstant
    ? clinicMinutesOfDay(currentInstant)
    : null;
  const currentTimeLabel = currentInstant ? formatTime(currentInstant) : null;
  const showCurrentTime =
    currentDateKey === dateKey &&
    currentMinute !== null &&
    currentMinute >= startMinute &&
    currentMinute < endMinute;
  // Keep short appointments legible without changing their actual duration or
  // breaking the shared time axis between professionals.
  const shortDuration = Math.min(
    15,
    ...dailyAppointments.map((a) => Math.max(5, a.durationMinutes)),
  );
  const pixelsPerMinute = shortDuration < 15 ? 32 / shortDuration : 2;
  const sortedColumns = Array.from(columns.entries()).sort((a, b) =>
    a[1].label.localeCompare(b[1].label, "es"),
  );
  const canMoveTo = (
    appointment: PeriodAppointment,
    minute: number,
    items: PeriodAppointment[],
  ) =>
    minute >= 0 &&
    minute < 1440 &&
    slots.some(
      (slot) =>
        minute >= toMinutes(slot.startTime) &&
        minute + appointment.durationMinutes <= toMinutes(slot.endTime),
    ) &&
    !items.some(
      (other) =>
        other.id !== appointment.id &&
        other.status !== "cancelled" &&
        clinicMinutesOfDay(other.scheduledAt) <
          minute + appointment.durationMinutes &&
        clinicMinutesOfDay(other.scheduledAt) + other.durationMinutes > minute,
    );
  const dragMinute = (event: React.DragEvent<HTMLElement>, offset: number) =>
    Math.round(
      (startMinute +
        (event.clientY -
          event.currentTarget.getBoundingClientRect().top -
          offset) /
          pixelsPerMinute) /
        5,
    ) * 5;
  const minuteLabel = (minute: number) =>
    `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

  function dayHref(dayKey: string): string {
    const query = new URLSearchParams();
    query.set("view", "day");
    query.set("date", dayKey);
    query.set("from", dayKey);
    query.set("to", dayKey);
    if (practitionerId) query.set("practitionerId", practitionerId);
    return "/appointments?" + query.toString();
  }

  return (
    <>
      {view === "day" ? (
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                {formatDateHeading(dateKey)}
                {dateKey === todayKey && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    Hoy
                  </span>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                {dailyAppointments.length === 0
                  ? "Sin citas programadas"
                  : dailyAppointments.length +
                    (dailyAppointments.length === 1
                      ? " cita · "
                      : " citas · ") +
                    durationLabel +
                    " sin canceladas"}
                {dayHours ? " · Horario: " + dayHours : " · Clínica cerrada"}
              </CardDescription>
            </div>
            {!isClosed && (
              <Button type="button" onClick={() => openBooking(dateKey)}>
                <PlusIcon data-icon="inline-start" />
                Nueva cita
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {columns.size === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/20 px-5 py-10 text-center">
                <p className="font-medium">
                  {isClosed
                    ? "La clínica no pasa consulta este día"
                    : "No hay citas para este día"}
                </p>
                {!isClosed && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Puedes reservar una nueva cita con el botón de arriba.
                  </p>
                )}
              </div>
            ) : (
              <>
                <p className="mb-2 text-xs text-muted-foreground">
                  Selecciona un hueco para crear una cita. Usa Editar o arrastra
                  una cita programada para cambiar su hora.
                </p>
                {notice && (
                  <p
                    role="status"
                    className="mb-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                  >
                    {notice}
                  </p>
                )}
                <div
                  className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
                  aria-label="Estados de las citas"
                >
                  {(
                    ["scheduled", "completed", "cancelled", "no_show"] as const
                  ).map((status) => (
                    <span key={status} className="flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-3 rounded-sm border",
                          STATUS_CARD_STYLES[status],
                        )}
                      />
                      {APPOINTMENT_STATUS_LABELS[status]}
                    </span>
                  ))}
                </div>
                <div className="overflow-x-auto rounded-xl border">
                  <div
                    style={{ minWidth: `${64 + sortedColumns.length * 240}px` }}
                  >
                    <div
                      className="grid border-b bg-muted/30"
                      style={{
                        gridTemplateColumns: `64px repeat(${sortedColumns.length}, minmax(240px, 1fr))`,
                      }}
                    >
                      <div className="p-3 text-xs text-muted-foreground">
                        Hora
                      </div>
                      {sortedColumns.map(([key, column]) => (
                        <div key={key} className="border-l p-3">
                          <h3 className="font-semibold">{column.label}</h3>
                          <p className="text-xs text-muted-foreground">
                            {column.appointments.length}{" "}
                            {column.appointments.length === 1
                              ? "cita"
                              : "citas"}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div
                      className="relative grid"
                      style={{
                        gridTemplateColumns: `64px repeat(${sortedColumns.length}, minmax(240px, 1fr))`,
                      }}
                    >
                      <div
                        className="relative"
                        style={{
                          height: (endMinute - startMinute) * pixelsPerMinute,
                        }}
                      >
                        {Array.from(
                          { length: (endMinute - startMinute) / 60 },
                          (_, i) => (
                            <span
                              key={i}
                              className="absolute right-2 -translate-y-1/2 text-xs tabular-nums text-muted-foreground"
                              style={{ top: i * 60 * pixelsPerMinute + 8 }}
                            >
                              {String(
                                Math.floor((startMinute + i * 60) / 60),
                              ).padStart(2, "0")}
                              :00
                            </span>
                          ),
                        )}
                      </div>
                      {sortedColumns.map(([key, column]) => {
                        const ordered = [...column.appointments].sort((a, b) =>
                          a.scheduledAt.localeCompare(b.scheduledAt),
                        );
                        const laneEnds: number[] = [];
                        const placed = ordered.map((appointment) => {
                          const start = clinicMinutesOfDay(
                            appointment.scheduledAt,
                          );
                          let lane = laneEnds.findIndex((end) => end <= start);
                          if (lane < 0) lane = laneEnds.length;
                          laneEnds[lane] = start + appointment.durationMinutes;
                          return { appointment, start, lane };
                        });
                        const lanes = Math.max(1, laneEnds.length);
                        return (
                          <section
                            key={key}
                            aria-label={column.label}
                            className="relative border-l bg-muted/30"
                            style={{
                              height:
                                (endMinute - startMinute) * pixelsPerMinute,
                            }}
                            onDragOver={(event) => {
                              const drag = dragRef.current;
                              if (
                                drag?.appointment.practitionerId === key &&
                                !pending
                              ) {
                                event.preventDefault();
                                const minute = dragMinute(event, drag.offset);
                                const valid = canMoveTo(
                                  drag.appointment,
                                  minute,
                                  column.appointments,
                                );
                                event.dataTransfer.dropEffect = valid
                                  ? "move"
                                  : "none";
                                setDragPreview((current) =>
                                  current?.minute === minute &&
                                  current.valid === valid
                                    ? current
                                    : { minute, valid },
                                );
                              }
                            }}
                            onDragLeave={(event) => {
                              if (
                                !event.currentTarget.contains(
                                  event.relatedTarget as Node | null,
                                )
                              )
                                setDragPreview(null);
                            }}
                            onDrop={(event) => {
                              const drag = dragRef.current;
                              if (
                                !drag ||
                                drag.appointment.practitionerId !== key ||
                                pending
                              )
                                return;
                              event.preventDefault();
                              const minute = dragMinute(event, drag.offset);
                              dragRef.current = null;
                              setDragging(null);
                              setDragPreview(null);
                              if (
                                !canMoveTo(
                                  drag.appointment,
                                  minute,
                                  column.appointments,
                                )
                              ) {
                                setNotice(
                                  "No se ha movido la cita: el horario elegido no está disponible.",
                                );
                                return;
                              }
                              const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
                              if (
                                time !==
                                formatTime(drag.appointment.scheduledAt)
                              )
                                saveTime(
                                  drag.appointment,
                                  time,
                                  drag.appointment.durationMinutes,
                                  false,
                                );
                            }}
                          >
                            {slots.map((slot, i) => (
                              <div
                                key={i}
                                className="absolute inset-x-0 bg-background"
                                style={{
                                  top:
                                    (toMinutes(slot.startTime) - startMinute) *
                                    pixelsPerMinute,
                                  height:
                                    (toMinutes(slot.endTime) -
                                      toMinutes(slot.startTime)) *
                                    pixelsPerMinute,
                                }}
                              />
                            ))}
                            {dragging?.practitionerId === key &&
                              Array.from(
                                {
                                  length: Math.ceil(
                                    (endMinute - startMinute) / 5,
                                  ),
                                },
                                (_, i) => {
                                  const minute = startMinute + i * 5;
                                  return canMoveTo(
                                    dragging,
                                    minute,
                                    column.appointments,
                                  ) ? (
                                    <div
                                      key={i}
                                      aria-hidden="true"
                                      className="pointer-events-none absolute inset-x-0 z-10 border-t border-emerald-300/40 bg-emerald-200/60"
                                      style={{
                                        top: i * 5 * pixelsPerMinute,
                                        height: 5 * pixelsPerMinute,
                                      }}
                                    />
                                  ) : null;
                                },
                              )}
                            {dragging?.practitionerId === key &&
                              dragPreview &&
                              dragPreview.minute >= startMinute &&
                              dragPreview.minute < endMinute && (
                                <div
                                  aria-hidden="true"
                                  className={cn(
                                    "pointer-events-none absolute inset-x-1 z-30 overflow-visible rounded-md border-2 px-2 py-1 text-xs font-semibold shadow-sm",
                                    dragPreview.valid
                                      ? "border-emerald-600 bg-emerald-100/95 text-emerald-950"
                                      : "border-red-500 bg-red-100/95 text-red-950",
                                  )}
                                  style={{
                                    top:
                                      (dragPreview.minute - startMinute) *
                                      pixelsPerMinute,
                                    height: Math.max(
                                      dragging.durationMinutes *
                                        pixelsPerMinute,
                                      32,
                                    ),
                                  }}
                                >
                                  {minuteLabel(dragPreview.minute)} ·{" "}
                                  {dragPreview.valid
                                    ? "Soltar aquí"
                                    : "Horario no disponible"}
                                </div>
                              )}
                            {Array.from(
                              { length: (endMinute - startMinute) / 30 },
                              (_, i) => {
                                const time = startMinute + i * 30;
                                const insideHours = slots.some(
                                  (slot) =>
                                    time >= toMinutes(slot.startTime) &&
                                    time < toMinutes(slot.endTime),
                                );
                                const occupied = column.appointments.some(
                                  (a) =>
                                    a.status !== "cancelled" &&
                                    clinicMinutesOfDay(a.scheduledAt) <
                                      time + 30 &&
                                    clinicMinutesOfDay(a.scheduledAt) +
                                      a.durationMinutes >
                                      time,
                                );
                                const canBook =
                                  insideHours &&
                                  !occupied &&
                                  key !== "unassigned" &&
                                  (practitioners == null ||
                                    practitioners.some((p) => p.id === key));
                                return canBook ? (
                                  <button
                                    key={i}
                                    type="button"
                                    aria-label={`Nueva cita con ${column.label} a las ${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`}
                                    onClick={() => openSlotBooking(time, key)}
                                    className="absolute inset-x-0 border-t border-border/60 hover:bg-primary/10 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                    style={{
                                      top: i * 30 * pixelsPerMinute,
                                      height: 30 * pixelsPerMinute,
                                    }}
                                  />
                                ) : (
                                  <div
                                    key={i}
                                    className="pointer-events-none absolute inset-x-0 border-t border-border/60"
                                    style={{ top: i * 30 * pixelsPerMinute }}
                                  />
                                );
                              },
                            )}
                            {placed.map(({ appointment, start, lane }) => (
                              <div
                                key={appointment.id}
                                className={cn(
                                  "group absolute px-1 pb-1",
                                  moved?.appointment.id === appointment.id &&
                                    "z-30",
                                )}
                                style={{
                                  top: (start - startMinute) * pixelsPerMinute,
                                  left: `${(lane * 100) / lanes}%`,
                                  width: `${100 / lanes}%`,
                                  height:
                                    appointment.durationMinutes *
                                    pixelsPerMinute,
                                }}
                              >
                                <AppointmentEventCard
                                  appointment={appointment}
                                  showProfessional={false}
                                  shortCard={
                                    appointment.durationMinutes *
                                      pixelsPerMinute <
                                    44
                                  }
                                  fill
                                />
                                {appointment.status === "scheduled" && (
                                  <div className="absolute bottom-1 right-2 top-0 flex items-center rounded bg-background/95 opacity-0 shadow-sm group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                                    <span
                                      draggable={!pending}
                                      onDragStart={(event) => {
                                        dragRef.current = {
                                          appointment,
                                          offset:
                                            event.clientY -
                                            event.currentTarget.parentElement!.parentElement!.getBoundingClientRect()
                                              .top,
                                        };
                                        event.dataTransfer.effectAllowed =
                                          "move";
                                        event.dataTransfer.setData(
                                          "text/plain",
                                          appointment.id,
                                        );
                                        setDragging(appointment);
                                      }}
                                      onDragEnd={() => {
                                        dragRef.current = null;
                                        setDragging(null);
                                        setDragPreview(null);
                                      }}
                                      className="hidden cursor-grab select-none px-1 text-xs text-muted-foreground sm:inline"
                                      title="Arrastrar para cambiar la hora"
                                      aria-hidden="true"
                                    >
                                      ⠿
                                    </span>
                                    <button
                                      type="button"
                                      disabled={pending}
                                      onClick={() => openEdit(appointment)}
                                      aria-label={`Editar hora de ${appointment.patientName}`}
                                      className="rounded p-1 text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                      <PencilIcon className="size-4" />
                                    </button>
                                  </div>
                                )}
                                {moved?.appointment.id === appointment.id && (
                                  <div
                                    role="status"
                                    className="absolute left-1 top-full z-30 w-64 max-w-[calc(100vw-2rem)] rounded-md border bg-background px-3 py-2 text-xs shadow-md"
                                  >
                                    <div>
                                      Cita movida de{" "}
                                      {formatTime(
                                        moved.appointment.scheduledAt,
                                      )}{" "}
                                      a {moved.newTime}.
                                    </div>
                                    {undoError && (
                                      <p
                                        role="alert"
                                        className="mt-1 text-destructive"
                                      >
                                        {undoError}
                                      </p>
                                    )}
                                    <div className="mt-2 flex items-center gap-3">
                                      <button
                                        type="button"
                                        disabled={pending}
                                        className="font-medium text-primary underline disabled:opacity-50"
                                        onClick={() => {
                                          const original = moved.appointment;
                                          setUndoError("");
                                          startTransition(async () => {
                                            const result =
                                              await rescheduleAppointmentAction(
                                                original.id,
                                                dateKey,
                                                formatTime(
                                                  original.scheduledAt,
                                                ),
                                                original.durationMinutes,
                                              );
                                            if (result.error) {
                                              setUndoError(
                                                "No se pudo deshacer: " +
                                                  result.error,
                                              );
                                              return;
                                            }
                                            setNotice(
                                              `Cita de ${original.patientName} restaurada a las ${formatTime(original.scheduledAt)}.`,
                                            );
                                            setMoved(null);
                                            router.refresh();
                                          });
                                        }}
                                      >
                                        {pending ? "Deshaciendo…" : "Deshacer"}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={pending}
                                        className="text-muted-foreground underline"
                                        onClick={() => setMoved(null)}
                                      >
                                        Cerrar
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </section>
                        );
                      })}
                      {showCurrentTime &&
                        currentMinute !== null &&
                        currentTimeLabel && (
                          <CurrentTimeIndicator
                            label={currentTimeLabel}
                            top={
                              (currentMinute - startMinute) * pixelsPerMinute
                            }
                            left={64}
                          />
                        )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-lg">Semana · {periodLabel}</CardTitle>
              <CardDescription className="mt-1">
                {appointments.length}{" "}
                {appointments.length === 1 ? "cita" : "citas"} · Selecciona un
                día para verlo en detalle
              </CardDescription>
            </div>
            <Button type="button" onClick={() => openBooking(dateKey)}>
              <PlusIcon data-icon="inline-start" />
              Nueva cita
            </Button>
          </CardHeader>
          <CardContent>
            <div
              className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
              aria-label="Estados de las citas"
            >
              {(
                ["scheduled", "completed", "cancelled", "no_show"] as const
              ).map((status) => (
                <span key={status} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-3 rounded-sm border",
                      STATUS_CARD_STYLES[status],
                    )}
                  />
                  {APPOINTMENT_STATUS_LABELS[status]}
                </span>
              ))}
            </div>
            {(() => {
              const weekSlots = visibleDays.flatMap(
                (day) =>
                  schedule.days.find(
                    (entry) => entry.weekday === weekdayIndex(day),
                  )?.slots ?? [],
              );
              const first =
                Math.floor(
                  Math.min(
                    540,
                    ...weekSlots.map((slot) => toMinutes(slot.startTime)),
                    ...appointments.map((a) =>
                      clinicMinutesOfDay(a.scheduledAt),
                    ),
                  ) / 60,
                ) * 60;
              const last =
                Math.ceil(
                  Math.max(
                    1020,
                    ...weekSlots.map((slot) => toMinutes(slot.endTime)),
                    ...appointments.map(
                      (a) =>
                        clinicMinutesOfDay(a.scheduledAt) + a.durationMinutes,
                    ),
                  ) / 60,
                ) * 60;
              const weekShortest = Math.min(
                15,
                ...appointments.map((a) => Math.max(5, a.durationMinutes)),
              );
              const weekScale = weekShortest < 15 ? 32 / weekShortest : 2;
              const grid = "64px repeat(7, minmax(170px, 1fr))";
              return (
                <div className="overflow-x-auto rounded-xl border">
                  <div style={{ minWidth: "1254px" }}>
                    <div
                      className="grid border-b bg-muted/30"
                      style={{ gridTemplateColumns: grid }}
                    >
                      <div className="p-3 text-xs text-muted-foreground">
                        Hora
                      </div>
                      {visibleDays.map((day) => (
                        <Link
                          key={day}
                          href={dayHref(day)}
                          className={cn(
                            "border-l p-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                            day === todayKey && "bg-primary/5 text-primary",
                          )}
                        >
                          <span className="block text-sm font-semibold capitalize">
                            {parseDateKey(day).toLocaleDateString("es-ES", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {(appointmentByDay.get(day) ?? []).length} citas
                            {day === todayKey ? " · Hoy" : ""}
                          </span>
                        </Link>
                      ))}
                    </div>
                    <div className="grid" style={{ gridTemplateColumns: grid }}>
                      <div
                        className="relative"
                        style={{ height: (last - first) * weekScale }}
                      >
                        {Array.from({ length: (last - first) / 60 }, (_, i) => (
                          <span
                            key={i}
                            className="absolute right-2 -translate-y-1/2 text-xs tabular-nums text-muted-foreground"
                            style={{ top: i * 60 * weekScale + 8 }}
                          >
                            {String(Math.floor((first + i * 60) / 60)).padStart(
                              2,
                              "0",
                            )}
                            :00
                          </span>
                        ))}
                      </div>
                      {visibleDays.map((day) => {
                        const daySlots =
                          schedule.days.find(
                            (entry) => entry.weekday === weekdayIndex(day),
                          )?.slots ?? [];
                        const events = [
                          ...(appointmentByDay.get(day) ?? []),
                        ].sort((a, b) =>
                          a.scheduledAt.localeCompare(b.scheduledAt),
                        );
                        const groups: {
                          start: number;
                          end: number;
                          appointments: PeriodAppointment[];
                        }[] = [];
                        for (const appointment of events) {
                          const start = clinicMinutesOfDay(
                            appointment.scheduledAt,
                          );
                          const end = start + appointment.durationMinutes;
                          const previous = groups[groups.length - 1];
                          if (previous && start < previous.end) {
                            previous.end = Math.max(previous.end, end);
                            previous.appointments.push(appointment);
                          } else {
                            groups.push({
                              start,
                              end,
                              appointments: [appointment],
                            });
                          }
                        }
                        return (
                          <section
                            key={day}
                            aria-label={formatDateHeading(day)}
                            className="relative border-l bg-muted/30"
                            style={{ height: (last - first) * weekScale }}
                          >
                            {daySlots.map((slot, i) => (
                              <div
                                key={i}
                                className="absolute inset-x-0 bg-background"
                                style={{
                                  top:
                                    (toMinutes(slot.startTime) - first) *
                                    weekScale,
                                  height:
                                    (toMinutes(slot.endTime) -
                                      toMinutes(slot.startTime)) *
                                    weekScale,
                                }}
                              />
                            ))}
                            {Array.from(
                              { length: (last - first) / 30 },
                              (_, i) => (
                                <div
                                  key={i}
                                  className="pointer-events-none absolute inset-x-0 border-t border-border/60"
                                  style={{ top: i * 30 * weekScale }}
                                />
                              ),
                            )}
                            {day === currentDateKey &&
                              currentMinute !== null &&
                              currentTimeLabel &&
                              currentMinute >= first &&
                              currentMinute < last && (
                                <CurrentTimeIndicator
                                  label={currentTimeLabel}
                                  top={(currentMinute - first) * weekScale}
                                />
                              )}
                            {groups.map((group) => (
                              <div
                                key={group.appointments[0].id}
                                className="absolute inset-x-0 px-0.5 pb-0.5 focus-within:z-20 has-[details[open]]:z-20"
                                style={{
                                  top: (group.start - first) * weekScale,
                                  height: (group.end - group.start) * weekScale,
                                }}
                              >
                                {group.appointments.length === 1 ? (
                                  <AppointmentEventCard
                                    appointment={group.appointments[0]}
                                    fill
                                    weekCard
                                    shortCard={
                                      (group.end - group.start) * weekScale < 44
                                    }
                                  />
                                ) : (
                                  <details className="relative h-full">
                                    <summary
                                      className="flex h-full cursor-pointer list-none flex-col overflow-hidden rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs leading-4 text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      aria-label={`${group.appointments.length} citas coincidentes a partir de las ${String(Math.floor(group.start / 60)).padStart(2, "0")}:${String(group.start % 60).padStart(2, "0")}. Mostrar citas`}
                                    >
                                      <span className="font-semibold">
                                        {String(
                                          Math.floor(group.start / 60),
                                        ).padStart(2, "0")}
                                        :
                                        {String(group.start % 60).padStart(
                                          2,
                                          "0",
                                        )}{" "}
                                        · {group.appointments.length} citas
                                      </span>
                                      <span>Ver pacientes y médicos</span>
                                    </summary>
                                    <div className="absolute left-0 top-full z-30 mt-1 max-h-80 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg">
                                      {group.appointments.map((appointment) => (
                                        <Link
                                          key={appointment.id}
                                          href={
                                            "/appointments/" + appointment.id
                                          }
                                          className="block rounded-md px-2 py-2 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                          <span className="block font-medium">
                                            {formatTime(
                                              appointment.scheduledAt,
                                            )}{" "}
                                            · {appointment.patientName}
                                          </span>
                                          <span className="block text-muted-foreground">
                                            {[
                                              appointment.practitionerHonorific,
                                              appointment.practitionerName,
                                            ]
                                              .filter(Boolean)
                                              .join(" ") ||
                                              "Sin profesional"}{" "}
                                            ·{" "}
                                            {
                                              APPOINTMENT_STATUS_LABELS[
                                                appointment.status
                                              ]
                                            }{" "}
                                            · {appointment.durationMinutes} min
                                          </span>
                                        </Link>
                                      ))}
                                    </div>
                                  </details>
                                )}
                              </div>
                            ))}
                          </section>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      <NewAppointmentDialog
        key={`${bookingDate}-${bookingTime ?? ""}-${bookingPractitioner ?? ""}`}
        practitioners={practitioners}
        defaultDate={bookingDate}
        defaultTime={bookingTime}
        defaultPractitionerId={bookingPractitioner}
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        hideTrigger
      />
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) closeTimeEditor();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar hora de la cita</DialogTitle>
            <DialogDescription>
              {editing?.patientName} · {formatDateHeading(dateKey)}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (editing) saveTime(editing, editTime, editDuration, true);
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-1 text-sm">
                Hora
                <input
                  className="h-9 w-full rounded-md border bg-background px-2"
                  type="time"
                  required
                  value={editTime}
                  onChange={(event) => setEditTime(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                Duración (min)
                <input
                  className="h-9 w-full rounded-md border bg-background px-2"
                  type="number"
                  min={5}
                  max={480}
                  required
                  value={editDuration}
                  onChange={(event) =>
                    setEditDuration(event.target.valueAsNumber)
                  }
                />
              </label>
            </div>
            {editError && (
              <p role="alert" className="text-sm text-destructive">
                {editError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={closeTimeEditor}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
