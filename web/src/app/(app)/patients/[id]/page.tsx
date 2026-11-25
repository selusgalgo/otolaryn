import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, PaperClipIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClinicalEntryRowActions } from "@/components/clinical-entries/clinical-entry-row-actions";
import { DraftBadge } from "@/components/clinical-entries/draft-badge";
import { PatientTextFieldCard } from "@/components/patients/patient-text-field-card";
import { PatientAntecedentesCard } from "@/components/patients/patient-antecedentes-card";
import { PatientNotesCard } from "@/components/patients/patient-notes-card";
import { PatientProfileSection } from "@/components/patients/patient-profile-section";
import { ApiError, apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { ConsultaWorkspace, OpenConsultaLink } from "@/components/clinical-entries/consulta-panel";
import { getClinicConsultationConfig } from "@/lib/clinic-consultation-template";
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
const DATE_PILL_CLASS =
  "inline-flex items-center rounded-full bg-sky-100 px-3 py-1 font-button text-button font-medium text-sky-700 hover:bg-sky-200";

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
  const [entries, practitioners, insuranceOptions, antecedentes, consultationConfig] =
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
      getClinicConsultationConfig(),
    ]);
  const template = consultationConfig.template;
  const canCreateClinicalEntries = me.role !== "recepcion";
  // Mismo criterio que la página de la consulta (el backend ya 403 a recepción).
  const canEditClinicalEntries = me.role === "admin" || me.role === "profesional";
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
    // Al abrir una consulta, su panel queda a la derecha de toda la ficha
    // (ver ConsultaWorkspace); la ficha se reorganiza por el ancho que le
    // queda (container queries), no por el de la pantalla.
    <ConsultaWorkspace
      patientId={id}
      entries={entries.data}
      template={template}
      enabledFields={consultationConfig.fields}
      canEdit={canEditClinicalEntries}
      canDelete={canDeleteClinicalEntries}
    >
    <div className="space-y-4">
      <PatientProfileSection
        patient={patient}
        insuranceOptions={insuranceOptions}
        insuranceName={insuranceName}
        practitionerOptions={practitioners}
        whatsappEnabled={whatsappEnabled}
        canCreateClinicalEntries={canCreateClinicalEntries}
      >
        {/* Columna derecha, de arriba a abajo: Antecedentes personales y
            familiares (solo admin/profesional, que tienen acceso clínico)
            uno al lado del otro solo en pantallas muy anchas (2xl: por
            debajo, el campo de detalle del modo edición se queda sin
            sitio), Consultas (visible para los tres roles desde que
            recepción puede leerlas, aunque no crearlas) y, cerrando,
            Historia clínica (texto libre). */}
        <div className="grid grid-cols-1 items-start gap-4 @md/col:grid-cols-2">
          <PatientTextFieldCard
            patientId={id}
            field="drugAllergies"
            title="Alergias medicamentosas"
            value={patient.drugAllergies}
            emptyText="Sin alergias registradas."
            alert
          />
          <PatientTextFieldCard
            patientId={id}
            field="currentMedications"
            title="Medicación actual"
            value={patient.currentMedications}
            emptyText="Sin medicación registrada."
          />
        </div>
        {antecedentes !== null && (
          <div className="grid grid-cols-1 items-start gap-4 @4xl/col:grid-cols-2">
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Consultas</CardTitle>
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
                    <TableHead className="hidden @md/col:table-cell">Doctor</TableHead>
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
                      // Resaltada mientras su consulta está abierta en el panel.
                      <TableRow key={entry.id} className="has-[[aria-current=true]]:bg-sky-50">
                        <TableCell className="align-top whitespace-nowrap">
                          {/* Firmadas: se abren en el panel lateral. Borradores:
                              siguen en su página (autoguardado en el servidor). */}
                          {isDraft ? (
                            <Link href={`/patients/${id}/clinical-entries/${entry.id}`} className={DATE_PILL_CLASS}>
                              {formatDate(entry.visitDate)}
                            </Link>
                          ) : (
                            <OpenConsultaLink patientId={id} entryId={entry.id} className={DATE_PILL_CLASS}>
                              {formatDate(entry.visitDate)}
                            </OpenConsultaLink>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          {isDraft && (
                            <div className="mb-1">
                              <DraftBadge expiresAt={entry.draftExpiresAt} />
                            </div>
                          )}
                          <div>
                            {entry.chiefComplaint ? (
                              truncateText(stripHtml(entry.chiefComplaint), MOTIVO_MAX_CHARS)
                            ) : (
                              isDraft && <span className="text-muted-foreground">Sin motivo todavía</span>
                            )}
                          </div>
                          {(entry.attachmentCount ?? 0) > 0 && (
                            <div
                              className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"
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
                            <div className="text-left text-xs font-bold text-muted-foreground @md/col:hidden">
                              {authorHonorific} {truncateText(authorName, DOCTOR_NAME_MAX_CHARS)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="align-top hidden font-bold @md/col:table-cell">
                          {authorName ? `${authorHonorific} ${truncateText(authorName, DOCTOR_NAME_MAX_CHARS)}` : "—"}
                        </TableCell>
                        <TableCell className="align-top whitespace-nowrap">
                          <div className="-mt-[3px] flex items-start justify-end">
                          {isOwnDraft ? (
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/patients/${id}/clinical-entries/${entry.id}`}>Continuar</Link>
                            </Button>
                          ) : isDraft ? (
                            <Button asChild variant="ghost" size="icon-sm" aria-label="Ver este borrador">
                              <Link href={`/patients/${id}/clinical-entries/${entry.id}`}>
                                <EyeIcon />
                              </Link>
                            </Button>
                          ) : (
                            <Button asChild variant="ghost" size="icon-sm">
                              <OpenConsultaLink patientId={id} entryId={entry.id} aria-label="Ver esta consulta">
                                <EyeIcon />
                              </OpenConsultaLink>
                            </Button>
                          )}
                          {/* Las consultas firmadas ya no se eliminan desde la
                              lista; solo los borradores conservan "Descartar". */}
                          {isDraft && (
                            <ClinicalEntryRowActions
                              patientId={id}
                              entryId={entry.id}
                              canDelete={false}
                              isDraft
                              canDiscard={isOwnDraft || canDeleteClinicalEntries}
                            />
                          )}
                          </div>
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

        <PatientNotesCard patientId={id} notes={patient.notes} />
      </PatientProfileSection>
    </div>
    </ConsultaWorkspace>
  );
}
