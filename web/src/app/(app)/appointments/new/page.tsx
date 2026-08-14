import { PlusIcon } from "lucide-react";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { PatientPicker } from "@/components/appointments/patient-picker";
import { createAppointmentForPatientAction } from "@/lib/actions/appointments";
import { getPractitionerOptions } from "@/lib/practitioners";

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const [practitioners, { date }] = await Promise.all([getPractitionerOptions(), searchParams]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Nueva cita</h1>
      <AppointmentForm
        action={createAppointmentForPatientAction}
        submitLabel="Crear cita"
        submitIcon={<PlusIcon data-icon="inline-start" />}
        practitioners={practitioners}
        defaultDate={date}
      >
        <PatientPicker />
      </AppointmentForm>
    </div>
  );
}
