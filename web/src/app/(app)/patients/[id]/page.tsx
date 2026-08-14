import Link from "next/link";
import { notFound } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppointmentStatusBadge } from "@/components/appointments/appointment-status-badge";
import { CreateAppointmentDialog } from "@/components/appointments/create-appointment-dialog";
import { DeletePatientButton } from "@/components/patients/delete-patient-button";
import { EditPatientDialog } from "@/components/patients/edit-patient-dialog";
import { PatientAvatar } from "@/components/patients/patient-avatar";
import { ApiError, apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getPractitionerOptions } from "@/lib/practitioners";
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

  const me = await getCurrentUser();
  // recepcion has no access to clinical history at all — the backend 403s
  // this endpoint for that role, so it's skipped entirely rather than
  // fetched and hidden.
  const [entries, appointments, practitioners] = await Promise.all([
    me.role === "recepcion"
      ? null
      : apiFetch<Paginated<ClinicalEntry>>(`/patients/${id}/clinical-entries?pageSize=50`),
    apiFetch<Paginated<Appointment>>(`/appointments?patientId=${id}&pageSize=50`),
    getPractitionerOptions(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <PatientAvatar firstName={patient.firstName} lastName={patient.lastName} size="lg" />
          <h1 className="text-2xl font-bold">
            {patient.firstName} {patient.lastName}
          </h1>
        </div>
        <div className="flex gap-2">
          <EditPatientDialog patient={patient} />
          {/* recepcion can create/edit patients but not discharge one —
              backend already 403s this for that role (see PatientsController),
              hidden here too so the button isn't there to click in the first place. */}
          {me.role !== "recepcion" && <DeletePatientButton id={patient.id} />}
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

      {entries !== null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Historia clínica</CardTitle>
            <Button asChild size="sm">
              <Link href={`/patients/${id}/clinical-entries/new`}>
                <PlusIcon data-icon="inline-start" />
                Nueva entrada
              </Link>
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
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Agenda</CardTitle>
          <CreateAppointmentDialog patientId={id} practitioners={practitioners} />
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
                    <span className="shrink-0">
                      <AppointmentStatusBadge status={appointment.status} />
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
