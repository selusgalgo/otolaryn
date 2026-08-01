import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppointmentStatusBadge } from "@/components/appointments/appointment-status-badge";
import { apiFetch } from "@/lib/api";
import type { Me, Patient, TodayDashboard } from "@/lib/types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

export default async function DashboardPage() {
  const date = todayIso();
  const [me, dashboard] = await Promise.all([
    apiFetch<Me>("/auth/me"),
    apiFetch<TodayDashboard>(`/dashboard/today?date=${date}`),
  ]);

  // Same pattern as the Agenda list: the API only returns patientId, not a
  // name, so it's resolved here for display. Deduped across both widgets
  // since the same patient can show up in the agenda and in the history.
  const patientIds = Array.from(
    new Set([
      ...dashboard.appointments.map((a) => a.patientId),
      ...dashboard.clinicalEntries.map((e) => e.patientId),
    ]),
  );
  const patients = await Promise.all(
    patientIds.map((id) => apiFetch<Patient>(`/patients/${id}`).catch(() => null)),
  );
  const patientById = new Map(
    patients.filter((p): p is Patient => p !== null).map((p) => [p.id, p]),
  );

  function patientName(patientId: string): string {
    const patient = patientById.get(patientId);
    return patient ? `${patient.firstName} ${patient.lastName}` : "—";
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Hola, {me.firstName}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agenda de hoy</CardTitle>
        </CardHeader>
        <CardContent>
          {dashboard.appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin citas hoy.</p>
          ) : (
            <ul className="divide-y">
              {dashboard.appointments.map((appointment) => (
                <li key={appointment.id} className="py-2">
                  <Link
                    href={`/appointments/${appointment.id}`}
                    className="flex items-center justify-between gap-4 hover:underline"
                  >
                    <span className="text-sm">
                      {formatTime(appointment.scheduledAt)} · {patientName(appointment.patientId)}
                    </span>
                    <AppointmentStatusBadge status={appointment.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historia clínica de hoy</CardTitle>
        </CardHeader>
        <CardContent>
          {dashboard.clinicalEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin entradas registradas hoy.</p>
          ) : (
            <ul className="divide-y">
              {dashboard.clinicalEntries.map((entry) => (
                <li key={entry.id} className="py-2">
                  <Link
                    href={`/patients/${entry.patientId}/clinical-entries/${entry.id}`}
                    className="flex items-center justify-between gap-4 hover:underline"
                  >
                    <span className="text-sm">
                      {patientName(entry.patientId)} · {entry.chiefComplaint}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(entry.visitDate)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
