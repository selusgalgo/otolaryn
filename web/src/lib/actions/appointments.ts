"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import type { Appointment } from "@/lib/types";

export interface AppointmentFormState {
  error?: string;
}

function newAppointmentBody(formData: FormData): { scheduledAt: string; durationMinutes?: number; notes?: string } | null {
  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim();
  const durationMinutes = String(formData.get("durationMinutes") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!date || !time) {
    return null;
  }

  return {
    scheduledAt: new Date(`${date}T${time}`).toISOString(),
    ...(durationMinutes ? { durationMinutes: Number(durationMinutes) } : {}),
    ...(notes ? { notes } : {}),
  };
}

export async function createAppointmentAction(
  patientId: string,
  _prevState: AppointmentFormState,
  formData: FormData,
): Promise<AppointmentFormState> {
  const body = newAppointmentBody(formData);
  if (!body) {
    return { error: "Indica fecha y hora de la cita." };
  }

  let appointment: Appointment;
  try {
    appointment = await apiFetch<Appointment>(`/patients/${patientId}/appointments`, {
      method: "POST",
      body,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo crear la cita." };
  }

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/appointments");
  redirect(`/appointments/${appointment.id}`);
}

// Used by /appointments/new: the same form lets staff pick an existing
// patient or fill one in inline (first-time callers who aren't in the
// system yet). If a new patient is being created, that POST happens first
// and its id feeds the appointment POST right after — there's no
// transaction spanning both calls, so a failure on the appointment step
// after the patient was created leaves an orphan (but valid, reusable)
// patient record rather than silently losing the patient's details.
export async function createAppointmentForPatientAction(
  _prevState: AppointmentFormState,
  formData: FormData,
): Promise<AppointmentFormState> {
  const mode = String(formData.get("mode") ?? "existing");
  let patientId: string;

  if (mode === "new") {
    const email = String(formData.get("patientEmail") ?? "").trim();
    const patientBody = {
      firstName: String(formData.get("patientFirstName") ?? "").trim(),
      lastName: String(formData.get("patientLastName") ?? "").trim(),
      documentId: String(formData.get("patientDocumentId") ?? "").trim(),
      dateOfBirth: String(formData.get("patientDateOfBirth") ?? ""),
      phone: String(formData.get("patientPhone") ?? "").trim(),
      ...(email ? { email } : {}),
    };

    try {
      const patient = await apiFetch<{ id: string }>("/patients", {
        method: "POST",
        body: patientBody,
      });
      patientId = patient.id;
    } catch (err) {
      if (err instanceof ApiError) {
        return { error: `No se pudo crear el paciente: ${err.message}` };
      }
      return { error: "No se pudo crear el paciente." };
    }
  } else {
    patientId = String(formData.get("patientId") ?? "").trim();
    if (!patientId) {
      return { error: "Selecciona un paciente o cambia a \"Paciente nuevo\"." };
    }
  }

  const body = newAppointmentBody(formData);
  if (!body) {
    return { error: "Indica fecha y hora de la cita." };
  }

  let appointment: Appointment;
  try {
    appointment = await apiFetch<Appointment>(`/patients/${patientId}/appointments`, {
      method: "POST",
      body,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo crear la cita." };
  }

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/appointments");
  redirect(`/appointments/${appointment.id}`);
}

export async function updateAppointmentAction(
  id: string,
  _prevState: AppointmentFormState,
  formData: FormData,
): Promise<AppointmentFormState> {
  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim();
  const durationMinutes = String(formData.get("durationMinutes") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!date || !time) {
    return { error: "Indica fecha y hora de la cita." };
  }

  const body = {
    scheduledAt: new Date(`${date}T${time}`).toISOString(),
    ...(durationMinutes ? { durationMinutes: Number(durationMinutes) } : {}),
    notes: notes || null,
    ...(status ? { status } : {}),
  };

  try {
    await apiFetch<Appointment>(`/appointments/${id}`, {
      method: "PATCH",
      body,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo actualizar la cita." };
  }

  revalidatePath("/appointments");
  revalidatePath(`/appointments/${id}`);
  redirect(`/appointments/${id}`);
}

export async function cancelAppointmentAction(id: string): Promise<void> {
  await apiFetch(`/appointments/${id}`, {
    method: "PATCH",
    body: { status: "cancelled" },
  });
  revalidatePath("/appointments");
  revalidatePath(`/appointments/${id}`);
  redirect(`/appointments/${id}`);
}
