import { notFound } from "next/navigation";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { ApiError, apiFetch } from "@/lib/api";
import { createAppointmentAction } from "@/lib/actions/appointments";
import type { Patient } from "@/lib/types";

export default async function NewAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
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

  const boundAction = createAppointmentAction.bind(null, id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Nueva cita</h1>
        <p className="text-sm text-muted-foreground">
          {patient.firstName} {patient.lastName}
        </p>
      </div>
      <AppointmentForm action={boundAction} submitLabel="Crear cita" />
    </div>
  );
}
