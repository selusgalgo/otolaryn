"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api";
import { scheduleFromFormData } from "@/lib/schedule";
import type { Schedule } from "@/lib/types";

export interface ScheduleFormState {
  error?: string;
  success?: boolean;
}

// admin, own clinic.
export async function updateScheduleAction(
  _prevState: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  try {
    await apiFetch<Schedule>("/settings/schedule", {
      method: "PATCH",
      body: { days: scheduleFromFormData(formData) },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo guardar el horario." };
  }

  revalidatePath("/settings");
  return { success: true };
}
