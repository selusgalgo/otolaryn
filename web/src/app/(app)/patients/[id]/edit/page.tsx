import { notFound } from "next/navigation";
import { PatientForm } from "@/components/patients/patient-form";
import { ApiError, apiFetch } from "@/lib/api";
import { updatePatientAction } from "@/lib/actions/patients";
import type { Patient } from "@/lib/types";

export default async function EditPatientPage({ params }: { params: Promise<{ id: string }> }) {
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

  const boundAction = updatePatientAction.bind(null, id);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Editar paciente</h1>
      <PatientForm action={boundAction} initialValues={patient} submitLabel="Guardar cambios" />
    </div>
  );
}
