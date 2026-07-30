import { notFound } from "next/navigation";
import { ClinicalEntryForm } from "@/components/clinical-entries/clinical-entry-form";
import { ApiError, apiFetch } from "@/lib/api";
import { createClinicalEntryAction } from "@/lib/actions/clinical-entries";
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
      <ClinicalEntryForm action={boundAction} />
    </div>
  );
}
