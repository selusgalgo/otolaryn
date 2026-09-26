import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AppointmentRowActions } from "@/components/appointments/appointment-row-actions";
import { AppointmentStatusBadge } from "@/components/appointments/appointment-status-badge";
import { NewAppointmentDialog } from "@/components/appointments/new-appointment-dialog";
import { OccupancyCalendar } from "@/components/appointments/occupancy-calendar";
import { apiFetch } from "@/lib/api";
import { getMonthAppointmentsAction } from "@/lib/actions/appointments";
import { getCurrentUser } from "@/lib/auth";
import { toDateKey } from "@/lib/calendar-grid";
import { getPractitionerOptions } from "@/lib/practitioners";
import type { Appointment, Paginated, Patient, Schedule } from "@/lib/types";
import { formatDocumentId, splitName } from "@/lib/utils";

const PAGE_SIZE = 20;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    page?: string;
    practitionerId?: string;
    openDay?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;
  const practitionerId = params.practitionerId;

  // The calendar itself is the filter — no separate date-range form.
  // Nothing in the URL yet means "the whole visible month" (today's);
  // navigating months or clicking a day (see OccupancyCalendar) sets
  // from/to explicitly instead.
  const now = new Date();
  const defaultFrom = toDateKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const defaultTo = toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const from = params.from || defaultFrom;
  const to = params.to || defaultTo;

  const query = new URLSearchParams();
  query.set("from", `${from}T00:00:00.000Z`);
  if (to) query.set("to", `${to}T23:59:59.999Z`);
  if (practitionerId) query.set("practitionerId", practitionerId);
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

  // The calendar's own grid always shows whatever month "from" falls in.
  const fromDate = new Date(`${from}T00:00:00`);
  const [schedule, appointments, allAppointments, practitioners, me] = await Promise.all([
    apiFetch<Schedule>("/settings/schedule"),
    getMonthAppointmentsAction(fromDate.getFullYear(), fromDate.getMonth(), practitionerId),
    // Deliberately unfiltered, regardless of the practitionerId above — the
    // calendar's per-profesional availability dots (see OccupancyCalendar)
    // always need every profesional's own appointments to judge each of
    // them individually, even while the main view is filtered down to just
    // one. Reusing `appointments` there would make everyone else's dot read
    // "free" whenever a specific profesional is selected, since their
    // appointments would never have been fetched at all.
    getMonthAppointmentsAction(fromDate.getFullYear(), fromDate.getMonth()),
    getPractitionerOptions(),
    getCurrentUser(),
  ]);
  // A day is "selected" on the calendar only when the filter is pinned to
  // exactly one day (from === to) — the same state a day click produces,
  // so clicking a day highlights itself on reload.
  const selectedDateKey = to === from ? from : undefined;
  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    qs.set("from", from);
    if (to) qs.set("to", to);
    if (practitionerId) qs.set("practitionerId", practitionerId);
    qs.set("page", String(p));
    return `/appointments?${qs.toString()}`;
  };

  // practitioners is null for a profesional (see getPractitionerOptions) —
  // every row they see is already scoped to themselves server-side, so
  // that's the only name worth resolving in that case. For admin/recepcion,
  // look the id up in the real list instead of assuming anything.
  const practitionerNameById = new Map(practitioners?.map((p) => [p.id, p.label]));
  function practitionerNameFor(appointment: Appointment): string | null {
    if (appointment.practitionerId) {
      const name = practitionerNameById.get(appointment.practitionerId);
      if (name) return name;
    }
    return me.role === "profesional" ? `${me.firstName} ${me.lastName}` : null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Agenda</h1>
        <NewAppointmentDialog practitioners={practitioners} />
      </div>

      <OccupancyCalendar
        year={fromDate.getFullYear()}
        month={fromDate.getMonth()}
        appointments={appointments}
        allAppointments={allAppointments}
        schedule={schedule}
        selectedDateKey={selectedDateKey}
        practitioners={practitioners}
        from={from}
        to={to}
        practitionerId={practitionerId}
        initialOpenDayKey={params.openDay}
      />

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Paciente</TableHead>
              <TableHead>Fecha y hora</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Profesional</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No hay citas en este rango.
                </TableCell>
              </TableRow>
            )}
            {result.data.map((appointment, i) => {
              const patient = patients[i];
              const practitionerName = practitionerNameFor(appointment);
              return (
                <TableRow key={appointment.id}>
                  <TableCell>
                    {patient ? (
                      <div className="flex items-center gap-3">
                        <InitialsAvatar firstName={patient.firstName} lastName={patient.lastName} size="sm" />
                        <div>
                          <div className="font-medium">
                            {patient.firstName} {patient.lastName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDocumentId(patient.documentId)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link href={`/appointments/${appointment.id}`} className="hover:underline">
                      {formatDateTime(appointment.scheduledAt)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <AppointmentStatusBadge status={appointment.status} />
                  </TableCell>
                  <TableCell>
                    {practitionerName ? (
                      <div className="flex items-center gap-3">
                        <InitialsAvatar {...splitName(practitionerName)} size="sm" />
                        {practitionerName}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <AppointmentRowActions appointment={appointment} practitioners={practitioners} />
                  </TableCell>
                </TableRow>
              );
            })}
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
                <Link href={pageHref(page - 1)}>Anterior</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Anterior
              </Button>
            )}
            {page < totalPages ? (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(page + 1)}>Siguiente</Link>
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
