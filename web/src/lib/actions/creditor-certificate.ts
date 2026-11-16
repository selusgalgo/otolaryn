"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, apiFetchMultipart, ApiError } from "@/lib/api";
import type { CreditorCertificateStatus } from "@/lib/types";

// Superadmin only: install / remove the digital certificate the server signs
// documents with. The passphrase travels in the same multipart body as the
// file (never in a URL), is checked by the API and stored there encrypted; it
// is not kept, logged or echoed back here.

export interface CertificateFormState {
  error?: string;
  success?: boolean;
}

// A .p12 is a few KB; the API's cap is 256 KB. Checked here too so a wrong file
// fails with a clear message instead of a dropped upload.
const MAX_CERTIFICATE_BYTES = 256 * 1024;

// Every platform page shows the certificate state somewhere (Facturación, the
// warning on each clinic's SEPA page), so refresh them all.
function refreshPlatformPages() {
  revalidatePath("/platform", "layout");
}

export async function installCertificateAction(
  _prevState: CertificateFormState,
  formData: FormData,
): Promise<CertificateFormState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Adjunta el archivo del certificado (.p12)." };
  }
  if (file.size > MAX_CERTIFICATE_BYTES) {
    return { error: "El archivo es demasiado grande para ser un certificado." };
  }
  const passphrase = String(formData.get("passphrase") ?? "");
  if (!passphrase) {
    return { error: "Escribe la contraseña del certificado." };
  }

  const body = new FormData();
  body.append("file", file, file.name);
  body.append("passphrase", passphrase);
  try {
    await apiFetchMultipart<CreditorCertificateStatus>("/platform/creditor-profile/certificate", body);
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo instalar el certificado." };
  }

  refreshPlatformPages();
  return { success: true };
}

export async function removeCertificateAction(): Promise<CertificateFormState> {
  try {
    await apiFetch<CreditorCertificateStatus>("/platform/creditor-profile/certificate", { method: "DELETE" });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "No se pudo quitar el certificado." };
  }

  refreshPlatformPages();
  return { success: true };
}
