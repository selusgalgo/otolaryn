import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AppointmentStatusBadge } from "@/components/appointments/appointment-status-badge";
import { NewAppointmentDialog } from "@/components/appointments/new-appointment-dialog";
import { OccupancyCalendar } from "@/components/appointments/occupancy-calendar";
import { apiFetch } from "@/lib/api";
import { getMonthAppointmentsAction } from "@/lib/actions/appointments";
import { getPractitionerOptions } from "@/lib/practitioners";
import type { Appointment, Paginated, Patient, Schedule } from "@/lib/types";

const PAGE_SIZE = 20;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;
  const from = params.from || todayIso();
  const to = params.to;

  const query = new URLSearchParams();
  query.set("from", `${from}T00:00:00.000Z`);
  if (to) query.set("to", `${to}T23:59:59.999Z`);
  query.set("page", String(page));
  query.set("pageSize", String(PAGE_SIZE));

  const result = await apiFetch<Paginated<Appointment>>(`/appointments?${query.toString()}`);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  // The API only returns patientId, not a name — resolved here so the
  // agenda reads as a list of people, not UUIDs. Fine at this page size
  // (max 20 rows); would need a batch lookup endpoint to scale further.
  const patients = await Promise.all(
    result.data.map((a) =>
      apiFetch<Patient>(`/patients/${a.patientId}`).catch(() => null),
    ),
  );

  // The calendar starts on whatever month "from" falls in (today, unless
  // the date-range form above has been used) — schedule is read-only here
  // for every tenant role (see SettingsController), profesional/recepcion
  // included, since they need it too to make sense of the colors.
  const fromDate = new Date(`${from}T00:00:00`);
  const [schedule, initialAppointments, practitioners] = await Promise.all([
    apiFetch<Schedule>("/settings/schedule"),
    getMonthAppointmentsAction(fromDate.getFullYear(), fromDate.getMonth()),
    getPractitionerOptions(),
  ]);
  // A day is "selected" on the calendar only when the filter form is
  // pinned to exactly one day (from === to) — the same state a day click
  // below produces, so clicking a day highlights itself on reload.
  const selectedDateKey = to === from ? from : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Agenda</h1>
        <NewAppointmentDialog practitioners={practitioners} />
      </div>

      <OccupancyCalendar
        initialYear={fromDate.getFullYear()}
        initialMonth={fromDate.getMonth()}
        initialAppointments={initialAppointments}
        schedule={schedule}
        selectedDateKey={selectedDateKey}
      />

      <form className="flex items-end gap-4" action="/appointments">
        <div className="space-y-2">
          <Label htmlFor="from">Desde</Label>
          <Input id="from" name="from" type="date" defaultValue={from} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="to">Hasta</Label>
          <Input id="to" name="to" type="date" defaultValue={to} />
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha y hora</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Duración</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No hay citas en este rango.
                </TableCell>
              </TableRow>
            )}
            {result.data.map((appointment, i) => (
              <TableRow key={appointment.id}>
                <TableCell>
                  <Link href={`/appointments/${appointment.id}`} className="hover:underline">
                    {formatDateTime(appointment.scheduledAt)}
                  </Link>
                </TableCell>
                <TableCell>
                  {patients[i] ? `${patients[i]!.firstName} ${patients[i]!.lastName}` : "—"}
                </TableCell>
                <TableCell>{appointment.durationMinutes} min</TableCell>
                <TableCell>
                  <AppointmentStatusBadge status={appointment.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Página {result.page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/appointments?from=${from}${to ? `&to=${to}` : ""}&page=${page - 1}`}>Anterior</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Anterior
              </Button>
            )}
            {page < totalPages ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/appointments?from=${from}${to ? `&to=${to}` : ""}&page=${page + 1}`}>Siguiente</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Siguiente
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
