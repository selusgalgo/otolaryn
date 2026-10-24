import Link from "next/link";
import { notFound } from "next/navigation";
import { EyeIcon, PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClinicalEntryRowActions } from "@/components/clinical-entries/clinical-entry-row-actions";
import { PatientAntecedentesCard } from "@/components/patients/patient-antecedentes-card";
import { PatientNotesCard } from "@/components/patients/patient-notes-card";
import { PatientProfileSection } from "@/components/patients/patient-profile-section";
import { ApiError, apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getInsuranceOptions } from "@/lib/insurance";
import { getPractitionerOptions } from "@/lib/practitioners";
import type { AntecedenteType, ClinicalEntry, Paginated, Patient, PatientAntecedente } from "@/lib/types";
import { stripHtml, truncateText } from "@/lib/utils";

// Topes de caracteres para que Fecha | Motivo | Doctor | Acciones quepan
// las cuatro sin que la fila crezca de alto — Motivo es rich text ya
// pasado por stripHtml, Doctor es "Dr. " + el nombre completo.
const MOTIVO_MAX_CHARS = 60;
const DOCTOR_NAME_MAX_CHARS = 12;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { dateStyle: "medium" });
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
  // recepcion can now read Consultas (list + print the ficha/tratamiento
  // PDFs) but never create one — see ClinicalEntriesController. Antecedentes
  // stays clinical-only, excluded for that role same as before.
  const [entries, practitioners, insuranceOptions, antecedentes] =
    await Promise.all([
      apiFetch<Paginated<ClinicalEntry>>(`/patients/${id}/clinical-entries?pageSize=50`),
      getPractitionerOptions(),
      getInsuranceOptions(),
      me.role === "recepcion"
        ? null
        : Promise.all([
            apiFetch<AntecedenteType[]>("/antecedente-types"),
            apiFetch<PatientAntecedente[]>(`/patients/${id}/antecedentes`),
          ]),
    ]);
  const canCreateClinicalEntries = me.role !== "recepcion";
  const canDeleteClinicalEntries = me.role === "admin";

  const insuranceName = insuranceOptions.find((o) => o.id === patient.insuranceEntityId)?.label;


  return (
    <div className="space-y-4">
      <PatientProfileSection
        patient={patient}
        insuranceOptions={insuranceOptions}
        insuranceName={insuranceName}
        practitionerOptions={practitioners}
      />

      {/* Debajo, a ancho completo: Consultas (visible para los tres roles
          desde que recepción puede leerlas, aunque no crearlas) y
          Antecedentes (solo admin/profesional, que tienen acceso
          clínico), y, cerrando la página, la tarjeta de Historia clínica
          (texto libre) — visible para todos los roles. Sin Antecedentes
          que mostrar al lado, Consultas ocupa el ancho completo. Below md
          todo se apila en una columna en este mismo orden de arriba a
          abajo. */}
      <div className={`grid grid-cols-1 gap-4 ${antecedentes !== null ? "md:grid-cols-[2fr_1fr]" : ""}`}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Consultas</CardTitle>
            {canCreateClinicalEntries && (
              <Button asChild size="sm">
                <Link href={`/patients/${id}/clinical-entries/new`}>
                  <PlusIcon data-icon="inline-start" />
                  Nueva consulta
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {entries.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin entradas todavía.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="hidden md:table-cell">Doctor</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.data.map((entry) => {
                    const authorName = entry.authorName;
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap">
                          <Link
                            href={`/patients/${id}/clinical-entries/${entry.id}`}
                            className="inline-flex items-center rounded-full bg-muted px-3 py-1 font-button text-button font-medium text-foreground hover:bg-muted/70"
                          >
                            {formatDate(entry.visitDate)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {truncateText(stripHtml(entry.chiefComplaint), MOTIVO_MAX_CHARS)}
                          {/* En escritorio el doctor vive en su propia
                              columna — en móvil, donde esa columna se
                              oculta, se muestra aquí debajo para no
                              perder el dato. */}
                          {authorName && (
                            <div className="text-left text-xs font-bold text-muted-foreground md:hidden">
                              Dr. {truncateText(authorName, DOCTOR_NAME_MAX_CHARS)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden font-bold md:table-cell">
                          {authorName ? `Dr. ${truncateText(authorName, DOCTOR_NAME_MAX_CHARS)}` : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Button asChild variant="ghost" size="icon" aria-label="Ver esta consulta">
                            <Link href={`/patients/${id}/clinical-entries/${entry.id}`}>
                              <EyeIcon />
                            </Link>
                          </Button>
                          <ClinicalEntryRowActions
                            patientId={id}
                            entryId={entry.id}
                            canDelete={canDeleteClinicalEntries}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {antecedentes !== null && (
          <div className="space-y-4">
            <PatientAntecedentesCard
              patientId={id}
              category="personal"
              title="Antecedentes personales"
              types={antecedentes[0].filter((t) => t.category === "personal")}
              initialMarked={antecedentes[1]}
            />
            <PatientAntecedentesCard
              patientId={id}
              category="familiar"
              title="Antecedentes familiares"
              types={antecedentes[0].filter((t) => t.category === "familiar")}
              initialMarked={antecedentes[1]}
            />
          </div>
        )}
    </div>

      <PatientNotesCard patientId={id} notes={patient.notes} />
    </div>
  );
}
