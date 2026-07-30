import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, apiFetch } from "@/lib/api";
import type { ClinicalEntry } from "@/lib/types";

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

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/patients/${id}`} className="text-sm text-muted-foreground hover:underline">
          ← Volver a la ficha del paciente
        </Link>
        <h1 className="text-2xl font-bold">{formatDateTime(entry.visitDate)}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Motivo de consulta</CardTitle>
        </CardHeader>
        <CardContent className="whitespace-pre-wrap text-sm">{entry.chiefComplaint}</CardContent>
      </Card>

      {entry.examinationFindings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Exploración</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">{entry.examinationFindings}</CardContent>
        </Card>
      )}

      {entry.diagnosis && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Diagnóstico</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">{entry.diagnosis}</CardContent>
        </Card>
      )}

      {entry.treatment && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tratamiento</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">{entry.treatment}</CardContent>
        </Card>
      )}

      {entry.followUpNotes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notas de seguimiento</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">{entry.followUpNotes}</CardContent>
        </Card>
      )}
    </div>
  );
}
