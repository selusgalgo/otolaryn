import { notFound } from "next/navigation";
import { ClinicalEntryForm } from "@/components/clinical-entries/clinical-entry-form";
import { ApiError, apiFetch } from "@/lib/api";
import {
  createClinicalEntryAction,
  finalizeClinicalEntryDraftAction,
  saveClinicalEntryDraftAction,
} from "@/lib/actions/clinical-entries";
import type { Patient } from "@/lib/types";

export default async function NewClinicalEntryPage({ params }: { params: Promise<{ id: string }> }) {
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

  const boundAction = createClinicalEntryAction.bind(null, id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Nueva entrada de historia clínica</h1>
        <p className="text-sm text-muted-foreground">
          {patient.firstName} {patient.lastName}
        </p>
      </div>
      {/* Mientras se escribe, el alta se guarda como borrador en el servidor:
          aparece en la ficha del paciente con la etiqueta "Borrador" para
          seguir desde cualquier ordenador. Al firmarlo se convierte en la
          consulta (finalize); sin borrador previo se crea directamente. */}
      <ClinicalEntryForm
        action={boundAction}
        draftKey={`clinical-entry-draft:new:${id}`}
        serverDraft={{
          save: saveClinicalEntryDraftAction.bind(null, id),
          finalize: finalizeClinicalEntryDraftAction.bind(null, id),
        }}
      />
    </div>
  );
}
