"use server";

import { revalidatePath } from "next/cache";
import { apiFetch, apiFetchMultipart, ApiError } from "@/lib/api";
import { clientHeaders } from "@/lib/client-headers";
import type { PublicSepaView } from "@/lib/types";

// Server Actions behind the public signing page (/sepa/[token]). The clinic
// owner has no session, so every call goes out with skipAuth: the token in
// the URL is the credential and the API checks it each time.

export interface SepaPublicFormState {
  error?: string;
  success?: boolean;
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function messageOf(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export async function saveSepaDebtorAction(
  token: string,
  _prevState: SepaPublicFormState,
  formData: FormData,
): Promise<SepaPublicFormState> {
  try {
    await apiFetch<PublicSepaView>(`/public/sepa/${encodeURIComponent(token)}`, {
      method: "PUT",
      skipAuth: true,
      headers: await clientHeaders(),
      body: {
        holderName: text(formData, "holderName"),
        holderTaxId: text(formData, "holderTaxId"),
        signerName: text(formData, "signerName"),
        signerPosition: text(formData, "signerPosition"),
        address: text(formData, "address"),
        postalCode: text(formData, "postalCode"),
        city: text(formData, "city"),
        province: text(formData, "province"),
        country: text(formData, "country"),
        email: text(formData, "email"),
        phone: text(formData, "phone"),
        iban: text(formData, "iban"),
        bic: text(formData, "bic"),
      },
    });
  } catch (err) {
    return {
      error: messageOf(err, "No se pudieron guardar tus datos. Inténtalo de nuevo."),
    };
  }

  revalidatePath(`/sepa/${token}`);
  return { success: true };
}

export async function signSepaWebAction(
  token: string,
  _prevState: SepaPublicFormState,
  formData: FormData,
): Promise<SepaPublicFormState> {
  try {
    await apiFetch<PublicSepaView>(`/public/sepa/${encodeURIComponent(token)}/sign`, {
      method: "POST",
      skipAuth: true,
      headers: await clientHeaders(),
      body: {
        typedName: text(formData, "typedName"),
        accept: formData.get("accept") === "on",
      },
    });
  } catch (err) {
    return {
      error: messageOf(err, "No se pudo firmar la orden. Inténtalo de nuevo."),
    };
  }

  revalidatePath(`/sepa/${token}`);
  return { success: true };
}

// 5 MB, same as the API's own cap — checked here too so a too-large file
// fails with a clear message instead of a dropped connection.
const MAX_SIGNED_PDF_BYTES = 5 * 1024 * 1024;

export async function signSepaCertificateAction(
  token: string,
  _prevState: SepaPublicFormState,
  formData: FormData,
): Promise<SepaPublicFormState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Adjunta el PDF firmado." };
  }
  if (file.size > MAX_SIGNED_PDF_BYTES) {
    return { error: "El PDF pesa más de 5 MB." };
  }

  const body = new FormData();
  body.append("file", file, file.name);
  try {
    await apiFetchMultipart<PublicSepaView>(
      `/public/sepa/${encodeURIComponent(token)}/sign-certificate`,
      body,
      "POST",
      { skipAuth: true, headers: await clientHeaders() },
    );
  } catch (err) {
    return {
      error: messageOf(err, "No se pudo subir el PDF firmado. Inténtalo de nuevo."),
    };
  }

  revalidatePath(`/sepa/${token}`);
  return { success: true };
}
