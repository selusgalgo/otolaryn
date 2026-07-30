import { AppointmentForm } from "@/components/appointments/appointment-form";
import { PatientPicker } from "@/components/appointments/patient-picker";
import { createAppointmentForPatientAction } from "@/lib/actions/appointments";

export default function NewAppointmentPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Nueva cita</h1>
      <AppointmentForm action={createAppointmentForPatientAction} submitLabel="Crear cita">
        <PatientPicker />
      </AppointmentForm>
    </div>
  );
}
