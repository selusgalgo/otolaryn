import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RichTextContent } from "@/components/ui/rich-text-content";
import { AttachmentsPanel } from "@/components/clinical-entries/attachments-panel";
import { ClinicalEntryForm } from "@/components/clinical-entries/clinical-entry-form";
import { DeleteClinicalEntryButton } from "@/components/clinical-entries/delete-clinical-entry-button";
import { DiscardDraftButton } from "@/components/clinical-entries/discard-draft-button";
import { DraftBadge } from "@/components/clinical-entries/draft-badge";
import { EditClinicalEntryDialog } from "@/components/clinical-entries/edit-clinical-entry-dialog";
import {
  finalizeClinicalEntryDraftAction,
  getReferringDoctorSuggestions,
  saveClinicalEntryDraftAction,
} from "@/lib/actions/clinical-entries";
import { getClinicConsultationTemplate } from "@/lib/clinic-consultation-template";
import { FIELD_KIND, fieldLabel, visibleFields, type ConsultationField } from "@/lib/consultation-template";
import { ApiError, apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { decodeJwtClaims } from "@/lib/jwt";
import { getSessionToken } from "@/lib/session";
import type { ClinicalEntry } from "@/lib/types";

// Campos con su propio PDF imprimible (ruta hermana de esta página).
const PRINTABLE: Partial<Record<ConsultationField, string>> = {
  treatment: "treatment-pdf",
  report: "report-pdf",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

export default async function ClinicalEntryDetailPage({
  params,
}: {
  params: Promise<{ id: string; entryId: string }>;
}) {
  const { id, entryId } = await params;

  let entry: ClinicalEntry;
  try {
    entry = await apiFetch<ClinicalEntry>(`/clinical-entries/${entryId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  // The entry id resolved, but it belongs to a different patient than the
  // one in the URL — treat it the same as "not found" rather than silently
  // rendering data under the wrong patient's page.
  if (entry.patientId !== id) {
    notFound();
  }

  const me = await getCurrentUser();
  const template = await getClinicConsultationTemplate();
  const canEdit = me.role === "admin" || me.role === "profesional";
  const suggestions =
    canEdit && visibleFields(template, entry).includes("referringDoctor")
      ? await getReferringDoctorSuggestions()
      : [];

  // Borrador (aún no firmada): solo llega aquí su autor o un administrador (la
  // API responde 404 al resto). El autor sigue escribiéndolo en el mismo
  // formulario del alta, ya con su borrador del servidor; un administrador lo
  // ve en solo lectura y puede descartarlo. Nunca se edita, elimina ni imprime
  // como una consulta firmada. Quién es el autor se lee del JWT de la cookie sin
  // verificar la firma: solo decide qué se muestra — la API es la que impide
  // editar un borrador ajeno.
  const isDraft = entry.status === "borrador";
  const isOwnDraft = isDraft && entry.authorUserId === decodeJwtClaims(await getSessionToken())?.sub;

  if (isOwnDraft) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href={`/patients/${id}`} className="text-sm text-muted-foreground hover:underline">
              ← Volver a la ficha del paciente
            </Link>
            <h1 className="text-2xl font-bold">Borrador de consulta</h1>
            <div className="mt-1">
              <DraftBadge expiresAt={entry.draftExpiresAt} />
            </div>
          </div>
          <DiscardDraftButton patientId={id} draftId={entry.id} />
        </div>
        <ClinicalEntryForm
          template={template}
          referringDoctorSuggestions={suggestions}
          action={finalizeClinicalEntryDraftAction.bind(null, id, entry.id)}
          initialValues={entry}
          draftKey={`clinical-entry-draft:draft:${entry.id}`}
          attachmentsPatientId={id}
          serverDraft={{ draftId: entry.id, save: saveClinicalEntryDraftAction.bind(null, id) }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={`/patients/${id}`} className="text-sm text-muted-foreground hover:underline">
            ← Volver a la ficha del paciente
          </Link>
          <h1 className="text-2xl font-bold">{formatDateTime(entry.visitDate)}</h1>
          {isDraft && (
            <div className="mt-1">
              <DraftBadge expiresAt={entry.draftExpiresAt} />
              <p className="mt-1 text-xs text-muted-foreground">
                Borrador de otro profesional: solo puedes verlo y descartarlo. No cuenta en la historia clínica
                hasta que su autor lo firme.
              </p>
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {isDraft ? (
            <DiscardDraftButton patientId={id} draftId={entry.id} />
          ) : (
            <>
              {canEdit && (
                <EditClinicalEntryDialog
                  entry={entry}
                  template={template}
                  referringDoctorSuggestions={suggestions}
                />
              )}
              {me.role === "admin" && <DeleteClinicalEntryButton patientId={id} entryId={entryId} />}
            </>
          )}
        </div>
      </div>

      {/* Campos según la plantilla de la clínica, en su orden. El primero
          (Motivo / Enfermedad actual) sale siempre; el resto solo si tiene
          texto. Tratamiento e Informe se pueden imprimir. */}
      {visibleFields(template, entry)
        .filter((field) => field === "chiefComplaint" || !!entry[field])
        .map((field) => {
          const printHref = isDraft ? null : PRINTABLE[field];
          return (
            <Card key={field}>
              <CardHeader className={printHref ? "flex flex-row items-center justify-between" : undefined}>
                <CardTitle className="text-base">{fieldLabel(template, field)}</CardTitle>
                {printHref && (
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={`/patients/${id}/clinical-entries/${entryId}/${printHref}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ArrowDownTrayIcon data-icon="inline-start" />
                      Imprimir
                    </a>
                  </Button>
                )}
              </CardHeader>
              {FIELD_KIND[field] === "rich" ? (
                <CardContent>
                  <RichTextContent html={entry[field] ?? ""} />
                </CardContent>
              ) : (
                <CardContent className="whitespace-pre-wrap text-sm">{entry[field]}</CardContent>
              )}
            </Card>
          );
        })}

      {/* Lo ve quien ve la consulta; se añaden y quitan desde «Editar». */}
      <AttachmentsPanel patientId={id} entryId={entryId} canManage={false} />
    </div>
  );
}
