import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, PaperClipIcon, PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClinicalEntryRowActions } from "@/components/clinical-entries/clinical-entry-row-actions";
import { DraftBadge } from "@/components/clinical-entries/draft-badge";
import { PatientAntecedentesCard } from "@/components/patients/patient-antecedentes-card";
import { PatientNotesCard } from "@/components/patients/patient-notes-card";
import { PatientProfileSection } from "@/components/patients/patient-profile-section";
import { ApiError, apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getClinicConsultationTemplate } from "@/lib/clinic-consultation-template";
import { fieldLabel } from "@/lib/consultation-template";
import { getInsuranceOptions } from "@/lib/insurance";
import { decodeJwtClaims } from "@/lib/jwt";
import { getPractitionerOptions } from "@/lib/practitioners";
import { getSessionToken } from "@/lib/session";
import type { AntecedenteType, ClinicalEntry, Paginated, Patient, PatientAntecedente } from "@/lib/types";
import { stripHtml, truncateText } from "@/lib/utils";

// Topes de caracteres para que Fecha | Motivo | Doctor | Acciones quepan
// las cuatro sin que la fila crezca de alto — Motivo es rich text ya
// pasado por stripHtml, Doctor es "Dr. "/"Dra. " + el nombre completo.
const MOTIVO_MAX_CHARS = 60;
const DOCTOR_NAME_MAX_CHARS = 12;
const CLINICAL_ENTRIES_PAGE_SIZE = 50;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { dateStyle: "medium" });
}

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ entriesPage?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const requestedPage = Number.parseInt(query.entriesPage ?? "1", 10);
  const entriesPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

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
  const [entries, practitioners, insuranceOptions, antecedentes, template] =
    await Promise.all([
      apiFetch<Paginated<ClinicalEntry>>(
        `/patients/${id}/clinical-entries?page=${entriesPage}&pageSize=${CLINICAL_ENTRIES_PAGE_SIZE}`,
      ),
      getPractitionerOptions(),
      getInsuranceOptions(),
      me.role === "recepcion"
        ? null
        : Promise.all([
            apiFetch<AntecedenteType[]>("/antecedente-types"),
            apiFetch<PatientAntecedente[]>(`/patients/${id}/antecedentes`),
          ]),
      getClinicConsultationTemplate(),
    ]);
  const canCreateClinicalEntries = me.role !== "recepcion";
  const canDeleteClinicalEntries = me.role === "admin";
  const totalEntryPages = Math.max(1, Math.ceil(entries.total / entries.pageSize));
  // Quién es el usuario actual, para saber qué borradores son suyos (los puede
  // continuar) frente a los de otros que solo ve un administrador. Se lee del
  // JWT de la cookie sin verificar la firma: es solo para decidir qué botón
  // mostrar — la API es la que impide editar un borrador ajeno.
  const meId = decodeJwtClaims(await getSessionToken())?.sub;

  const insuranceName = insuranceOptions.find((o) => o.id === patient.insuranceEntityId)?.label;
  const whatsappEnabled = (await apiFetch<{ enabled: boolean }>('/whatsapp-booking/feature-status')).enabled;


  return (
    <div className="space-y-4">
      <PatientProfileSection
        patient={patient}
        insuranceOptions={insuranceOptions}
        insuranceName={insuranceName}
        practitionerOptions={practitioners}
        whatsappEnabled={whatsappEnabled}
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
                    {/* "Motivo" (corto, como siempre) en ORL; en otra
                        plantilla, su propio nombre ("Enfermedad actual"). */}
                    <TableHead>{template === "orl" ? "Motivo" : fieldLabel(template, "chiefComplaint")}</TableHead>
                    <TableHead className="hidden md:table-cell">Doctor</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.data.map((entry) => {
                    const authorName = entry.authorName;
                    // "Dr." por defecto si la API aún no envía el tratamiento.
                    const authorHonorific = entry.authorHonorific ?? "Dr.";
                    const isDraft = entry.status === "borrador";
                    const isOwnDraft = isDraft && entry.authorUserId === meId;
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
                          {isDraft && (
                            <div className="mb-1">
                              <DraftBadge expiresAt={entry.draftExpiresAt} />
                            </div>
                          )}
                          {entry.chiefComplaint ? (
                            truncateText(stripHtml(entry.chiefComplaint), MOTIVO_MAX_CHARS)
                          ) : (
                            isDraft && <span className="text-muted-foreground">Sin motivo todavía</span>
                          )}
                          {(entry.attachmentCount ?? 0) > 0 && (
                            <div
                              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"
                              title={`${entry.attachmentCount} archivo(s) adjunto(s)`}
                            >
                              <PaperClipIcon className="size-3.5" aria-hidden />
                              {entry.attachmentCount}
                            </div>
                          )}
                          {/* En escritorio el doctor vive en su propia
                              columna — en móvil, donde esa columna se
                              oculta, se muestra aquí debajo para no
                              perder el dato. */}
                          {authorName && (
                            <div className="text-left text-xs font-bold text-muted-foreground md:hidden">
                              {authorHonorific} {truncateText(authorName, DOCTOR_NAME_MAX_CHARS)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden font-bold md:table-cell">
                          {authorName ? `${authorHonorific} ${truncateText(authorName, DOCTOR_NAME_MAX_CHARS)}` : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {isOwnDraft ? (
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/patients/${id}/clinical-entries/${entry.id}`}>Continuar</Link>
                            </Button>
                          ) : (
                            <Button asChild variant="ghost" size="icon" aria-label="Ver esta consulta">
                              <Link href={`/patients/${id}/clinical-entries/${entry.id}`}>
                                <EyeIcon />
                              </Link>
                            </Button>
                          )}
                          <ClinicalEntryRowActions
                            patientId={id}
                            entryId={entry.id}
                            canDelete={canDeleteClinicalEntries}
                            isDraft={isDraft}
                            canDiscard={isOwnDraft || canDeleteClinicalEntries}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {entries.total > entries.pageSize && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <span className="text-sm text-muted-foreground">
                  Página {entries.page} de {totalEntryPages} · {entries.total} consultas
                </span>
                <div className="flex gap-2">
                  {entries.page > 1 && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/patients/${id}?entriesPage=${entries.page - 1}`}>
                        <ChevronLeftIcon data-icon="inline-start" />
                        Más recientes
                      </Link>
                    </Button>
                  )}
                  {entries.page < totalEntryPages && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/patients/${id}?entriesPage=${entries.page + 1}`}>
                        Ver consultas anteriores
                        <ChevronRightIcon data-icon="inline-end" />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
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
