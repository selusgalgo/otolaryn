import { PatientForm } from "@/components/patients/patient-form";
import { createPatientAction } from "@/lib/actions/patients";

export default function NewPatientPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nuevo paciente</h1>
      <PatientForm action={createPatientAction} submitLabel="Crear paciente" />
    </div>
  );
}
