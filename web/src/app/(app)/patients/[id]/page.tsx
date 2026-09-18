import Link from "next/link";
import { notFound } from "next/navigation";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppointmentStatusBadge } from "@/components/appointments/appointment-status-badge";
import { CreateAppointmentDialog } from "@/components/appointments/create-appointment-dialog";
import { DeletePatientButton } from "@/components/patients/delete-patient-button";
import { EditPatientDialog } from "@/components/patients/edit-patient-dialog";
import { PatientAntecedentesCard } from "@/components/patients/patient-antecedentes-card";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { ApiError, apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getInsuranceOptions } from "@/lib/insurance";
import { getPractitionerOptions } from "@/lib/practitioners";
import type {
  AntecedenteType,
  Appointment,
  ClinicalEntry,
  Paginated,
  Patient,
  PatientAntecedente,
} from "@/lib/types";
import { formatDateOnly, formatDocumentId } from "@/lib/utils";

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
  // fetched and hidden. Antecedentes are clinical data too, same
  // exclusion.
  const [entries, appointments, practitioners, insuranceOptions, antecedentes] =
    await Promise.all([
      me.role === "recepcion"
        ? null
        : apiFetch<Paginated<ClinicalEntry>>(`/patients/${id}/clinical-entries?pageSize=50`),
      apiFetch<Paginated<Appointment>>(`/appointments?patientId=${id}&pageSize=50`),
      getPractitionerOptions(),
      getInsuranceOptions(),
      me.role === "recepcion"
        ? null
        : Promise.all([
            apiFetch<AntecedenteType[]>("/antecedente-types"),
            apiFetch<PatientAntecedente[]>(`/patients/${id}/antecedentes`),
          ]),
    ]);

  const insuranceName = insuranceOptions.find((o) => o.id === patient.insuranceEntityId)?.label;
  const assignedPractitionerName = practitioners?.find(
    (p) => p.id === patient.assignedPractitionerId,
  )?.label;

  const agendaCard = (
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
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <InitialsAvatar firstName={patient.firstName} lastName={patient.lastName} size="lg" />
          <h1 className="text-2xl font-bold">
            {patient.firstName} {patient.lastName}
          </h1>
        </div>
        <div className="flex gap-2">
          <EditPatientDialog
            patient={patient}
            insuranceOptions={insuranceOptions}
            practitionerOptions={practitioners}
          />
          {/* recepcion can create/edit patients but not discharge one —
              backend already 403s this for that role (see PatientsController),
              hidden here too so the button isn't there to click in the first place. */}
          {me.role !== "recepcion" && <DeletePatientButton id={patient.id} />}
        </div>
      </div>

      {/* Datos del paciente (60%) a la izquierda; a la derecha, Antecedentes
          para admin/profesional — es lo primero que quiere ver un
          clínico al abrir a un paciente, más que la agenda — o Agenda
          para recepcion, que no tiene acceso clínico y para quien sigue
          siendo lo más relevante ahí. Debajo, a ancho completo: Historia
          clínica y, cerrando la página, Agenda (recepcion ya la vio
          arriba, así que no se repite). Below md todo se apila en una
          columna en este mismo orden de arriba a abajo. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos del paciente</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Documento</div>
              <div>{formatDocumentId(patient.documentId)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Fecha de nacimiento</div>
              <div>{formatDateOnly(patient.dateOfBirth)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Teléfono</div>
              <div>{patient.phone}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Email</div>
              <div>{patient.email ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Dirección</div>
              <div>{patient.address ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Profesión</div>
              <div>{patient.profession ?? "—"}</div>
            </div>
            <div className="col-span-2">
              <div className="text-muted-foreground">Notas</div>
              <div className="whitespace-pre-line">{patient.notes ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Aseguradora</div>
              <div>{insuranceName ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Fecha de la primera cita</div>
              <div>
                {patient.firstConsultationDate ? formatDateOnly(patient.firstConsultationDate) : "—"}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-muted-foreground">Médico habitual</div>
              <div>{assignedPractitionerName ?? "—"}</div>
            </div>
          </CardContent>
        </Card>

        {antecedentes !== null ? (
          <PatientAntecedentesCard
            patientId={id}
            types={antecedentes[0]}
            initialMarked={antecedentes[1]}
          />
        ) : (
          agendaCard
        )}

        {entries !== null && (
          <Card className="md:col-span-2">
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

        {/* recepcion ya vio su Agenda arriba, en el hueco de la derecha —
            para admin/profesional (antecedentes ocupó ese hueco) va aquí
            debajo, a ancho completo. */}
        {antecedentes !== null && <div className="md:col-span-2">{agendaCard}</div>}
      </div>
    </div>
  );
}
