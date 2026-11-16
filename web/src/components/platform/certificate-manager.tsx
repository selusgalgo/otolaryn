"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { FileDropzone } from "@/components/patients/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  installCertificateAction,
  removeCertificateAction,
  type CertificateFormState,
} from "@/lib/actions/creditor-certificate";
import { keepValuesOnSubmit } from "@/lib/form-submit";
import type { CertificateSource } from "@/lib/types";

const initialState: CertificateFormState = {};

// Upload form: the .p12 (drag and drop) and its passphrase. The API installs it
// only if everything checks out — passphrase, validity, able to sign, issued to
// the creditor's NIF — and answers with the reason when it doesn't.
function InstallForm({ replacing }: { replacing: boolean }) {
  const [state, formAction, pending] = useActionState(installCertificateAction, initialState);
  // Remounting the form is what empties the file and the passphrase afterwards:
  // the passphrase shouldn't linger in a field once it has been used.
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (state.success) setFormKey((key) => key + 1);
  }, [state.success]);

  return (
    <form key={formKey} onSubmit={keepValuesOnSubmit(formAction)} className="grid gap-4">
      <FileDropzone
        name="file"
        accept=".p12,.pfx,application/x-pkcs12"
        disabled={pending}
        fileLabel="tu certificado (.p12)"
        hint="Archivo .p12 o .pfx"
        compact
      />

      <div className="space-y-2">
        <Label htmlFor="certificate-passphrase">Contraseña del certificado</Label>
        <Input
          id="certificate-passphrase"
          name="passphrase"
          type="password"
          required
          disabled={pending}
          // new-password: the browser must not offer to fill in (or save) one
          // of the user's own saved passwords here.
          autoComplete="new-password"
          className="max-w-sm"
        />
        <p className="text-xs text-muted-foreground">
          Se guarda cifrada en el servidor y no se vuelve a mostrar nunca.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Comprobando e instalando..." : replacing ? "Sustituir certificado" : "Instalar certificado"}
        </Button>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state.success && <p className="text-sm text-success">Certificado instalado.</p>}
      </div>
    </form>
  );
}

function RemoveButton() {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function remove() {
    startTransition(async () => {
      const result = await removeCertificateAction();
      if (result.error) setError(result.error);
      setConfirming(false);
    });
  }

  if (!confirming) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        Quitar certificado
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>A partir de ahora las órdenes se generarán sin tu firma. ¿Quitarlo?</span>
      <Button size="sm" variant="destructive" onClick={remove} disabled={pending}>
        {pending ? "Quitando..." : "Sí, quitar"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
        No
      </Button>
      {error && <p className="w-full text-destructive">{error}</p>}
    </div>
  );
}

interface CertificateManagerProps {
  // Where the current certificate comes from; null when there is none.
  source: CertificateSource | null;
  // Show the upload form straight away (nothing installed, or it is broken)
  // instead of tucking it under "Sustituir".
  expanded: boolean;
}

export function CertificateManager({ source, expanded }: CertificateManagerProps) {
  const replacing = source !== null;

  return (
    <div className="space-y-4">
      {expanded ? (
        <InstallForm replacing={replacing} />
      ) : (
        <details className="group rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">Sustituir el certificado</summary>
          <div className="pt-4">
            <InstallForm replacing />
          </div>
        </details>
      )}

      {source === "env" && (
        <p className="text-xs text-muted-foreground">
          El certificado actual viene de la configuración del servidor. Si subes uno aquí, tendrá prioridad sobre ese.
        </p>
      )}
      {source === "upload" && <RemoveButton />}
    </div>
  );
}
