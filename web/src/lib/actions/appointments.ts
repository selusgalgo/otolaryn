"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import type { Appointment, AppointmentStatus, Paginated, Patient } from "@/lib/types";

export interface AppointmentFormState {
  error?: string;
  success?: boolean;
}

export interface CalendarAppointment {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  patientId: string;
  patientName: string;
}

// Backs the Escritorio's mini-calendar: one call per visible month, called
// imperatively from a Client Component on navigation (same pattern as
// searchPatientsAction for PatientPicker) rather than a page reload. Reuses
// the existing GET /appointments date-range filter — already scoped
// correctly per role server-side (profesional forced to their own,
// admin/recepcion see the whole clinic), nothing extra to enforce here.
export async function getMonthAppointmentsAction(
  year: number,
  month: number,
): Promise<CalendarAppointment[]> {
  const from = new Date(Date.UTC(year, month, 1)).toISOString();
  const to = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)).toISOString();

  const result = await apiFetch<Paginated<Appointment>>(
    `/appointments?from=${from}&to=${to}&pageSize=100`,
  );

  // Same name-resolution pattern as the rest of Escritorio: the API only
  // returns patientId, not a name.
  const patientIds = Array.from(new Set(result.data.map((a) => a.patientId)));
  const patients = await Promise.all(
    patientIds.map((id) => apiFetch<Patient>(`/patients/${id}`).catch(() => null)),
  );
  const patientById = new Map(
    patients.filter((p): p is Patient => p !== null).map((p) => [p.id, p]),
  );

  return result.data.map((a) => {
    const patient = patientById.get(a.patientId);
    return {
      id: a.id,
      scheduledAt: a.scheduledAt,
      durationMinutes: a.durationMinutes,
      status: a.status,
      patientId: a.patientId,
      patientName: patient ? `${patient.firstName} ${patient.lastName}` : "—",
    };
  });
}

function newAppointmentBody(
  formData: FormData,
): { scheduledAt: string; durationMinutes?: number; notes?: string; practitionerId?: string } | null {
  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim();
  const durationMinutes = String(formData.get("durationMinutes") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  // Absent entirely for a profesional (the field isn't rendered — the
  // backend auto-assigns them); present and required for admin/recepcion.
  const practitionerId = String(formData.get("practitionerId") ?? "").trim();

  if (!date || !time) {
    return null;
  }

  return {
    scheduledAt: new Date(`${date}T${time}`).toISOString(),
    ...(durationMinutes ? { durationMinutes: Number(durationMinutes) } : {}),
    ...(notes ? { notes } : {}),
    ...(practitionerId ? { practitionerId } : {}),
  };
}

// Backs the "Nueva cita" modal on the patient detail page — revalidates
// and reports success instead of redirecting, so the dialog just closes
// and the Agenda card underneath refreshes in place.
export async function createAppointmentAction(
  patientId: string,
  _prevState: AppointmentFormState,
  formData: FormData,
): Promise<AppointmentFormState> {
  const body = newAppointmentBody(formData);
  if (!body) {
    return { error: "Indica fecha y hora de la cita." };
  }

  try {
    await apiFetch<Appointment>(`/patients/${patientId}/appointments`, {
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
  return { success: true };
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

// Backs the "Editar" modal on the appointment detail page — revalidates
// and reports success instead of redirecting, so the dialog just closes
// and the page underneath refreshes in place.
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
  // Absent for profesional (field not rendered) — a profesional can't
  // reassign their own appointment to someone else, only admin/recepcion do.
  const practitionerId = String(formData.get("practitionerId") ?? "").trim();

  if (!date || !time) {
    return { error: "Indica fecha y hora de la cita." };
  }

  const body = {
    scheduledAt: new Date(`${date}T${time}`).toISOString(),
    ...(durationMinutes ? { durationMinutes: Number(durationMinutes) } : {}),
    notes: notes || null,
    ...(status ? { status } : {}),
    ...(practitionerId ? { practitionerId } : {}),
  };

  let appointment: Appointment;
  try {
    appointment = await apiFetch<Appointment>(`/appointments/${id}`, {
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
  revalidatePath(`/patients/${appointment.patientId}`);
  return { success: true };
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
