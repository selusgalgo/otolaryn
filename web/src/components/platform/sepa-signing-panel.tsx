"use client";

import { useState, useTransition } from "react";
import {
  ArrowDownTrayIcon,
  ClipboardDocumentIcon,
  EnvelopeIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SigningLinkResult, SepaFormState } from "@/lib/actions/platform";
import { cn } from "@/lib/utils";
import type { SepaMandate, SepaMandateStatus } from "@/lib/types";

interface SepaSigningPanelProps {
  tenantId: string;
  mandate: SepaMandate;
  issueLinkAction: () => Promise<SigningLinkResult>;
  cancelAction: () => Promise<SepaFormState>;
}

export const STATUS_LABEL: Record<SepaMandateStatus, string> = {
  pendiente: "Pendiente de firma",
  firmada: "Firmada",
  cancelada: "Cancelada",
};

const STATUS_STYLE: Record<SepaMandateStatus, string> = {
  pendiente: "bg-amber-100 text-amber-900",
  firmada: "bg-emerald-100 text-emerald-900",
  cancelada: "bg-muted text-muted-foreground",
};

export function SepaStatusBadge({ status }: { status: SepaMandateStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  });
}

function Evidence({ mandate }: { mandate: SepaMandate }) {
  const e = mandate.signatureEvidence;
  if (!e) return null;
  const rows: [string, string][] = [
    [
      "Forma de firma",
      e.method === "certificate"
        ? "Certificado digital (PDF firmado subido)"
        : "Firma electrónica en la web",
    ],
    ["Fecha y hora", formatDateTime(e.signedAt)],
    ["Dirección IP", e.ip ?? "—"],
    ["Navegador", e.userAgent ?? "—"],
  ];
  if (e.typedName) rows.push(["Nombre escrito", e.typedName]);
  if (e.fileName) rows.push(["Archivo subido", e.fileName]);
  rows.push([
    "Sellado por el acreedor",
    e.creditorSeal
      ? `${e.creditorSeal.subject} (serie ${e.creditorSeal.serialNumber})`
      : "Sin sello: no había certificado configurado",
  ]);
  rows.push(["Huella SHA-256 del documento firmado", e.signedPdfSha256]);

  return (
    <div className="space-y-3">
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-all font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {e.method === "certificate" && e.extendsIssuedPdf === false && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          El archivo subido no parte del PDF que se le envió: el firmante lo
          volvió a guardar antes de firmar. Ábrelo en tu lector de PDF y
          comprueba que los datos son los de la orden y que la firma es válida.
        </p>
      )}
      {e.method === "certificate" && (
        <p className="text-xs text-muted-foreground">
          Se ha comprobado que el PDF contiene una firma digital, no que el
          certificado sea válido ni de quién es: eso se verifica abriendo el PDF
          en Acrobat o AutoFirma.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Conserva la orden firmada y estos datos mientras dure el mandato y 14
        meses después del último adeudo.
      </p>
    </div>
  );
}

function SigningLink({
  mandate,
  issueLinkAction,
}: Pick<SepaSigningPanelProps, "mandate" | "issueLinkAction">) {
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function generate() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const result = await issueLinkAction();
      if (result.error || !result.url || !result.expiresAt) {
        setError(result.error ?? "No se pudo generar el enlace.");
        return;
      }
      setLink({ url: result.url, expiresAt: result.expiresAt });
    });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setError("No se pudo copiar: selecciona el enlace y cópialo a mano.");
    }
  }

  const expiry = link
    ? new Date(link.expiresAt).toLocaleDateString("es-ES", {
        dateStyle: "long",
      })
    : null;
  const mailto = link
    ? `mailto:${mandate.email ?? ""}?subject=${encodeURIComponent("Orden de domiciliación SEPA de Mederi")}&body=${encodeURIComponent(
        `Hola,\n\nPara domiciliar los recibos de Mederi necesitamos que rellenes tus datos y firmes la orden de domiciliación SEPA en este enlace (válido hasta el ${expiry}):\n\n${link.url}\n\nPuedes firmar directamente en la web o, si tienes certificado digital, descargar el PDF, firmarlo y subirlo.\n\nUn saludo.`,
      )}`
    : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={generate}
          disabled={pending}
          variant={link ? "outline" : "default"}
        >
          <LinkIcon data-icon="inline-start" />
          {pending
            ? "Generando..."
            : link || mandate.tokenExpiresAt
              ? "Generar un enlace nuevo"
              : "Generar enlace de firma"}
        </Button>
        {!link && mandate.tokenExpiresAt && (
          <p className="text-xs text-muted-foreground">
            Hay un enlace activo hasta el{" "}
            {new Date(mandate.tokenExpiresAt).toLocaleDateString("es-ES", {
              dateStyle: "long",
            })}
            . Por seguridad no se puede volver a mostrar: genera uno nuevo si lo
            necesitas (el anterior dejará de funcionar).
          </p>
        )}
      </div>

      {link && (
        <div className="space-y-2 rounded-lg border bg-primary-tint p-3">
          <p className="text-sm">
            Envíale este enlace al cliente. Caduca el{" "}
            <span className="font-medium">{expiry}</span> y deja de funcionar el
            anterior.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              readOnly
              value={link.url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 bg-background"
            />
            <Button type="button" variant="outline" onClick={copy}>
              <ClipboardDocumentIcon data-icon="inline-start" />
              {copied ? "Copiado" : "Copiar"}
            </Button>
            {mailto && (
              <Button asChild variant="outline">
                <a href={mailto}>
                  <EnvelopeIcon data-icon="inline-start" />
                  Enviar por email
                </a>
              </Button>
            )}
          </div>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function CancelMandate({
  cancelAction,
}: Pick<SepaSigningPanelProps, "cancelAction">) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    startTransition(async () => {
      const result = await cancelAction();
      if (result.error) setError(result.error);
      setConfirming(false);
    });
  }

  if (!confirming) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        Cancelar orden
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>
        ¿Cancelar la orden? El enlace dejará de funcionar. La firma, si la hay,
        se conserva.
      </span>
      <Button
        size="sm"
        variant="destructive"
        onClick={cancel}
        disabled={pending}
      >
        {pending ? "Cancelando..." : "Sí, cancelar"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setConfirming(false)}
        disabled={pending}
      >
        No
      </Button>
      {error && <p className="w-full text-destructive">{error}</p>}
    </div>
  );
}

export function SepaSigningPanel({
  tenantId,
  mandate,
  issueLinkAction,
  cancelAction,
}: SepaSigningPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SepaStatusBadge status={mandate.status} />
        {mandate.status === "firmada" && mandate.signedAt && (
          <span className="text-sm text-muted-foreground">
            el {formatDateTime(mandate.signedAt)}
          </span>
        )}
        {mandate.status === "cancelada" && mandate.cancelledAt && (
          <span className="text-sm text-muted-foreground">
            el {formatDateTime(mandate.cancelledAt)}
          </span>
        )}
      </div>

      {mandate.status === "pendiente" && (
        <>
          <p className="text-sm text-muted-foreground">
            El cliente rellena sus datos y firma desde un enlace propio, sin
            cuenta. Puedes dejar vacíos los datos del titular en el formulario
            de abajo.
            {mandate.issuedAt
              ? " El cliente ya ha guardado sus datos; si cambias algo aquí, tendrá que revisar el documento otra vez."
              : ""}
          </p>
          <SigningLink mandate={mandate} issueLinkAction={issueLinkAction} />
        </>
      )}

      {mandate.status === "firmada" && (
        <>
          <Button asChild>
            <a href={`/platform/${tenantId}/sepa/signed-pdf`} download>
              <ArrowDownTrayIcon data-icon="inline-start" />
              Descargar PDF firmado
            </a>
          </Button>
          <Evidence mandate={mandate} />
        </>
      )}

      {mandate.status === "cancelada" && (
        <>
          <p className="text-sm text-muted-foreground">
            La orden está cancelada. Si guardas cambios en el formulario se
            reabre como pendiente y puedes pedir una firma nueva (la firma
            anterior se descarta).
          </p>
          {mandate.signatureEvidence && (
            <Button asChild variant="outline" size="sm">
              <a href={`/platform/${tenantId}/sepa/signed-pdf`} download>
                <ArrowDownTrayIcon data-icon="inline-start" />
                Descargar el PDF que se firmó
              </a>
            </Button>
          )}
        </>
      )}

      {mandate.status !== "cancelada" && (
        <CancelMandate cancelAction={cancelAction} />
      )}
    </div>
  );
}
