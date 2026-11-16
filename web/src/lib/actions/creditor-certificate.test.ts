import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
const apiFetchMultipart = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  apiFetchMultipart: (...args: unknown[]) => apiFetchMultipart(...args),
}));

import { ApiError } from "@/lib/api";
import { installCertificateAction, removeCertificateAction } from "./creditor-certificate";

function form(fields: { file?: File; passphrase?: string }): FormData {
  const data = new FormData();
  if (fields.file) data.append("file", fields.file);
  if (fields.passphrase !== undefined) data.append("passphrase", fields.passphrase);
  return data;
}

const certificate = () => new File(["p12-bytes"], "acreedor.p12");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("installCertificateAction", () => {
  it("asks for the file before calling the API", async () => {
    const result = await installCertificateAction({}, form({ passphrase: "clave" }));
    expect(result.error).toContain("Adjunta el archivo");
    expect(apiFetchMultipart).not.toHaveBeenCalled();
  });

  it("refuses an empty file", async () => {
    const result = await installCertificateAction({}, form({ file: new File([], "vacio.p12"), passphrase: "clave" }));
    expect(result.error).toContain("Adjunta el archivo");
  });

  it("refuses a file too big to be a certificate", async () => {
    const big = new File([new Uint8Array(300 * 1024)], "enorme.p12");
    const result = await installCertificateAction({}, form({ file: big, passphrase: "clave" }));
    expect(result.error).toContain("demasiado grande");
    expect(apiFetchMultipart).not.toHaveBeenCalled();
  });

  it("asks for the passphrase", async () => {
    const result = await installCertificateAction({}, form({ file: certificate(), passphrase: "" }));
    expect(result.error).toContain("contraseña");
    expect(apiFetchMultipart).not.toHaveBeenCalled();
  });

  it("sends the file and the passphrase together as multipart, then refreshes the platform pages", async () => {
    apiFetchMultipart.mockResolvedValue({ configured: true });

    const result = await installCertificateAction({}, form({ file: certificate(), passphrase: "mi-clave" }));

    expect(result).toEqual({ success: true });
    expect(apiFetchMultipart).toHaveBeenCalledTimes(1);
    const [path, body] = apiFetchMultipart.mock.calls[0] as [string, FormData];
    expect(path).toBe("/platform/creditor-profile/certificate");
    expect((body.get("file") as File).name).toBe("acreedor.p12");
    expect(body.get("passphrase")).toBe("mi-clave");
    expect(revalidatePath).toHaveBeenCalledWith("/platform", "layout");
  });

  it("shows the API's explanation when the certificate is refused, and refreshes nothing", async () => {
    apiFetchMultipart.mockRejectedValue(new ApiError(400, "La contraseña del certificado no es correcta."));

    const result = await installCertificateAction({}, form({ file: certificate(), passphrase: "mala" }));

    expect(result).toEqual({ error: "La contraseña del certificado no es correcta." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for an unexpected failure, without leaking it", async () => {
    apiFetchMultipart.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3000"));

    const result = await installCertificateAction({}, form({ file: certificate(), passphrase: "clave" }));

    expect(result).toEqual({ error: "No se pudo instalar el certificado." });
  });

  it("never puts the passphrase in the error it returns", async () => {
    apiFetchMultipart.mockRejectedValue(new ApiError(400, "No se puede leer el certificado."));
    const result = await installCertificateAction({}, form({ file: certificate(), passphrase: "secreto-123" }));
    expect(JSON.stringify(result)).not.toContain("secreto-123");
  });
});

describe("removeCertificateAction", () => {
  it("deletes the uploaded certificate and refreshes the platform pages", async () => {
    apiFetch.mockResolvedValue({ configured: false });

    expect(await removeCertificateAction()).toEqual({ success: true });

    expect(apiFetch).toHaveBeenCalledWith("/platform/creditor-profile/certificate", { method: "DELETE" });
    expect(revalidatePath).toHaveBeenCalledWith("/platform", "layout");
  });

  it("reports a failure", async () => {
    apiFetch.mockRejectedValue(new ApiError(500, "Error interno"));
    expect(await removeCertificateAction()).toEqual({ error: "Error interno" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
