import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CancelAppointmentButton } from "@/components/appointments/cancel-appointment-button";
import { AppointmentStatusBadge } from "@/components/appointments/appointment-status-badge";
import { EditAppointmentDialog } from "@/components/appointments/edit-appointment-dialog";
import { ApiError, apiFetch } from "@/lib/api";
import type { Appointment, Patient } from "@/lib/types";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", { dateStyle: "full", timeStyle: "short" });
}

export default async function AppointmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let appointment: Appointment;
  try {
    appointment = await apiFetch<Appointment>(`/appointments/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const patient = await apiFetch<Patient>(`/patients/${appointment.patientId}`);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/patients/${patient.id}`} className="text-sm text-muted-foreground hover:underline">
            {patient.firstName} {patient.lastName}
          </Link>
          <h1 className="text-2xl font-bold">{formatDateTime(appointment.scheduledAt)}</h1>
        </div>
        <div className="flex gap-2">
          <EditAppointmentDialog appointment={appointment} />
          {appointment.status !== "cancelled" && <CancelAppointmentButton id={appointment.id} />}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de la cita</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Duración</div>
            <div>{appointment.durationMinutes} minutos</div>
          </div>
          <div>
            <div className="text-muted-foreground">Estado</div>
            <div>
              <AppointmentStatusBadge status={appointment.status} />
            </div>
          </div>
          <div className="col-span-2">
            <div className="text-muted-foreground">Notas</div>
            <div>{appointment.notes ?? "—"}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
