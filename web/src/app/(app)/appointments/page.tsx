import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AppointmentStatusBadge } from "@/components/appointments/appointment-status-badge";
import { apiFetch } from "@/lib/api";
import type { Appointment, Paginated, Patient } from "@/lib/types";

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Agenda</h1>
        <Button asChild>
          <Link href="/appointments/new">
            <PlusIcon data-icon="inline-start" />
            Nueva cita
          </Link>
        </Button>
      </div>

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
