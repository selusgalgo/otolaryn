"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, ApiError } from "@/lib/api";

export type BackupConfigurationState = { error?: string; success?: boolean };

export async function runBackupAction(): Promise<{
  error?: string;
  message?: string;
}> {
  try {
    const result = await apiFetch<{
      status: string;
      tenantCount: number;
      successCount: number;
    }>("/platform/backups/runs", { method: "POST" });
    revalidatePath("/platform/backups");
    return {
      message:
        result.status === "succeeded"
          ? `Copia completada: ${result.successCount} clínicas.`
          : `Copia finalizada con incidencias: ${result.successCount} de ${result.tenantCount} clínicas.`,
    };
  } catch (error) {
    return {
      error:
        error instanceof ApiError
          ? error.message
          : "No se pudo iniciar la copia.",
    };
  }
}

export async function restoreBackupAction(
  artifactId: string,
  confirmation: string,
): Promise<{ error?: string; message?: string }> {
  try {
    const result = await apiFetch<{ tenantName: string }>(
      "/platform/backups/" + artifactId + "/restore",
      {
        method: "POST",
        body: { confirmation },
      },
    );
    revalidatePath("/platform/backups");
    revalidatePath("/platform", "layout");
    return { message: `Restauración de ${result.tenantName} completada.` };
  } catch (error) {
    return {
      error:
        error instanceof ApiError
          ? error.message
          : "No se pudo restaurar la clínica.",
    };
  }
}

export async function saveBackupConfigurationAction(
  _previous: BackupConfigurationState,
  form: FormData,
): Promise<BackupConfigurationState> {
  try {
    await apiFetch("/platform/backups/configuration", {
      method: "PUT",
      body: {
        bucket: String(form.get("bucket") ?? "").trim(),
        region: String(form.get("region") ?? "").trim(),
        keyId: String(form.get("keyId") ?? "").trim(),
        applicationKey: String(form.get("applicationKey") ?? "").trim(),
      },
    });
    revalidatePath("/platform/backups");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof ApiError
          ? error.message
          : "No se ha podido guardar la configuración.",
    };
  }
}
