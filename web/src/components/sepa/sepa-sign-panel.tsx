"use client";

import { useActionState, useState } from "react";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { FileDropzone } from "@/components/patients/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SepaPublicFormState } from "@/lib/actions/sepa-public";
import { keepValuesOnSubmit } from "@/lib/form-submit";
import { cn } from "@/lib/utils";

type FormAction = (prevState: SepaPublicFormState, formData: FormData) => Promise<SepaPublicFormState>;

interface SepaSignPanelProps {
  token: string;
  signerName: string;
  creditorName: string;
  signWebAction: FormAction;
  signCertificateAction: FormAction;
}

const initialState: SepaPublicFormState = {};

type Method = "web" | "certificate";

const TABS: { id: Method; label: string; hint: string }[] = [
  {
    id: "web",
    label: "Firmar aquí",
    hint: "Lo más rápido: sin certificado ni programas.",
  },
  {
    id: "certificate",
    label: "Firmar con certificado digital",
    hint: "Con AutoFirma o Acrobat, y subes el PDF firmado.",
  },
];

function WebSignature({
  signerName,
  creditorName,
  action,
}: Pick<SepaSignPanelProps, "signerName" | "creditorName"> & {
  action: FormAction;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form onSubmit={keepValuesOnSubmit(formAction)} className="grid max-w-xl gap-4">
      <div className="space-y-2">
        <Label htmlFor="typedName">Escribe tu nombre completo para firmar</Label>
        <Input
          id="typedName"
          name="typedName"
          required
          disabled={pending}
          autoComplete="off"
          placeholder={signerName}
        />
        <p className="text-xs text-muted-foreground">
          Tal como aparece en «Firmante» del documento: <span className="font-medium">{signerName}</span>
        </p>
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="accept"
          required
          disabled={pending}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <span>
          He revisado la orden de domiciliación y autorizo a <span className="font-medium">{creditorName}</span> a
          enviar instrucciones a mi banco para adeudar mi cuenta, y a mi banco a efectuar los adeudos según esas
          instrucciones.
        </span>
      </label>

      <p className="text-xs text-muted-foreground">
        Al firmar se guardan la fecha y hora, tu dirección IP y una huella del documento como prueba de tu
        consentimiento.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Firmando..." : "Firmar la orden"}
        </Button>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
    </form>
  );
}

function CertificateSignature({ token, action }: { token: string; action: FormAction }) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form onSubmit={keepValuesOnSubmit(formAction)} className="grid gap-4">
      <ol className="list-decimal space-y-3 pl-5 text-sm">
        <li>
          Descarga el documento:{" "}
          <Button asChild variant="outline" size="sm" className="ml-1">
            <a href={`/sepa/${token}/pdf`} download>
              <ArrowDownTrayIcon data-icon="inline-start" />
              Descargar PDF
            </a>
          </Button>
        </li>
        <li>
          Fírmalo con tu certificado digital (por ejemplo con AutoFirma o Adobe Acrobat), colocando la firma en el
          recuadro «Firma del deudor». No modifiques nada más.
        </li>
        <li>Sube aquí el PDF ya firmado:</li>
      </ol>

      <FileDropzone
        name="file"
        accept="application/pdf,.pdf"
        disabled={pending}
        fileLabel="el PDF firmado"
        hint="Máximo 5 MB."
        compact
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Enviando..." : "Enviar PDF firmado"}
        </Button>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
    </form>
  );
}

export function SepaSignPanel({
  token,
  signerName,
  creditorName,
  signWebAction,
  signCertificateAction,
}: SepaSignPanelProps) {
  const [method, setMethod] = useState<Method>("web");

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Forma de firma" className="grid gap-2 sm:grid-cols-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={method === tab.id}
            onClick={() => setMethod(tab.id)}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors",
              method === tab.id ? "border-primary bg-primary-tint" : "hover:bg-muted/50",
            )}
          >
            <span className="block text-sm font-semibold">{tab.label}</span>
            <span className="block text-xs text-muted-foreground">{tab.hint}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {method === "web" ? (
          <WebSignature signerName={signerName} creditorName={creditorName} action={signWebAction} />
        ) : (
          <CertificateSignature token={token} action={signCertificateAction} />
        )}
      </div>
    </div>
  );
}
