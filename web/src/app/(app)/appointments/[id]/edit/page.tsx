import { notFound } from "next/navigation";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { ApiError, apiFetch } from "@/lib/api";
import { updateAppointmentAction } from "@/lib/actions/appointments";
import type { Appointment, Patient } from "@/lib/types";

export default async function EditAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let appointment: Appointment;
  try {
    appointment = await apiFetch<Appointment>(`/appointments/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const patient = await apiFetch<Patient>(`/patients/${appointment.patientId}`);
  const boundAction = updateAppointmentAction.bind(null, id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Editar cita</h1>
        <p className="text-sm text-muted-foreground">
          {patient.firstName} {patient.lastName}
        </p>
      </div>
      <AppointmentForm action={boundAction} initialValues={appointment} submitLabel="Guardar cambios" showStatus />
    </div>
  );
}
