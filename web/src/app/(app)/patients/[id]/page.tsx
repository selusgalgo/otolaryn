import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeletePatientButton } from "@/components/patients/delete-patient-button";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointment-status";
import { ApiError, apiFetch } from "@/lib/api";
import type { Appointment, ClinicalEntry, Paginated, Patient } from "@/lib/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { dateStyle: "medium" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let patient: Patient;
  try {
    patient = await apiFetch<Patient>(`/patients/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const entries = await apiFetch<Paginated<ClinicalEntry>>(
    `/patients/${id}/clinical-entries?pageSize=50`,
  );

  const appointments = await apiFetch<Paginated<Appointment>>(
    `/appointments?patientId=${id}&pageSize=50`,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {patient.firstName} {patient.lastName}
        </h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/patients/${patient.id}/edit`}>Editar</Link>
          </Button>
          <DeletePatientButton id={patient.id} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos del paciente</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Documento</div>
            <div>{patient.documentId}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Fecha de nacimiento</div>
            <div>{patient.dateOfBirth}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Teléfono</div>
            <div>{patient.phone}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Email</div>
            <div>{patient.email ?? "—"}</div>
          </div>
          <div className="col-span-2">
            <div className="text-muted-foreground">Dirección</div>
            <div>{patient.address ?? "—"}</div>
          </div>
          <div className="col-span-2">
            <div className="text-muted-foreground">Notas</div>
            <div>{patient.notes ?? "—"}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Historia clínica</CardTitle>
          <Button asChild size="sm">
            <Link href={`/patients/${id}/clinical-entries/new`}>Nueva entrada</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {entries.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin entradas todavía.</p>
          ) : (
            <ul className="divide-y">
              {entries.data.map((entry) => (
                <li key={entry.id} className="py-2">
                  <Link
                    href={`/patients/${id}/clinical-entries/${entry.id}`}
                    className="flex items-center justify-between gap-4 hover:underline"
                  >
                    <span className="text-sm">{entry.chiefComplaint}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(entry.visitDate)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Agenda</CardTitle>
          <Button asChild size="sm">
            <Link href={`/patients/${id}/appointments/new`}>Nueva cita</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {appointments.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin citas todavía.</p>
          ) : (
            <ul className="divide-y">
              {appointments.data.map((appointment) => (
                <li key={appointment.id} className="py-2">
                  <Link
                    href={`/appointments/${appointment.id}`}
                    className="flex items-center justify-between gap-4 hover:underline"
                  >
                    <span className="text-sm">{formatDateTime(appointment.scheduledAt)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {APPOINTMENT_STATUS_LABELS[appointment.status]}
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
