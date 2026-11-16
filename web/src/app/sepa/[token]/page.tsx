import { ArrowDownTrayIcon, CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SepaDebtorForm } from "@/components/sepa/sepa-debtor-form";
import { SepaSignPanel } from "@/components/sepa/sepa-sign-panel";
import { saveSepaDebtorAction, signSepaCertificateAction, signSepaWebAction } from "@/lib/actions/sepa-public";
import { apiFetch, ApiError } from "@/lib/api";
import { clientHeaders } from "@/lib/client-headers";
import { formatCents } from "@/lib/sepa";
import type { PublicSepaView } from "@/lib/types";

function formatDate(iso: string): string {
  // "2026-12-01" is a calendar date, not an instant: parse it as UTC noon so
  // no timezone can shift it to the day before.
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-ES", {
    dateStyle: "long",
    timeZone: "UTC",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  });
}

function Unavailable({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-6">
        <ExclamationTriangleIcon className="mt-0.5 size-6 shrink-0 text-muted-foreground" />
        <div>
          <h1 className="text-lg font-semibold">No se puede abrir este enlace</h1>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {n}
      </span>
      {children}
    </span>
  );
}

export default async function SepaSigningPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let view: PublicSepaView;
  try {
    view = await apiFetch<PublicSepaView>(`/public/sepa/${encodeURIComponent(token)}`, {
      skipAuth: true,
      headers: await clientHeaders(),
    });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 410 || err.status === 429)) {
      return (
        <Unavailable
          message={
            err.status === 404
              ? "El enlace no es válido o ya no está activo. Pide uno nuevo a quien te lo envió."
              : err.message
          }
        />
      );
    }
    throw err;
  }

  const { amounts, creditor } = view;
  const signed = view.status === "firmada";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Orden de domiciliación SEPA</h1>
        <p className="text-sm text-muted-foreground">
          {view.clinicName} · Referencia {view.reference}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Qué vas a autorizar</CardTitle>
          <CardDescription>
            {creditor.name} (NIF {creditor.taxId}) cobrará por adeudo directo en tu cuenta el servicio Mederi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="font-medium">{view.planName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Periodicidad</dt>
              <dd className="font-medium">Mensual, desde el {formatDate(view.firstChargeDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Importe de cada adeudo</dt>
              <dd className="font-medium">{formatCents(amounts.totalCents)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Base {formatCents(amounts.baseCents)} + IVA ({view.vatPercent} %) {formatCents(amounts.vatCents)}
            {amounts.irpfCents > 0 && (
              <>
                {" "}
                − retención IRPF ({view.irpfPercent} %) {formatCents(amounts.irpfCents)}
              </>
            )}
            . Cada adeudo va precedido de su factura por correo electrónico.
          </p>
        </CardContent>
      </Card>

      {signed ? (
        <Card>
          <CardContent className="space-y-4 py-6">
            <div className="flex items-start gap-3">
              <CheckCircleIcon className="mt-0.5 size-7 shrink-0 text-success" />
              <div>
                <h2 className="text-lg font-semibold">Orden firmada</h2>
                <p className="text-sm text-muted-foreground">
                  {view.signedAt && <>Firmada el {formatDateTime(view.signedAt)} </>}
                  {view.signatureMethod === "certificate"
                    ? "con certificado digital"
                    : "con firma electrónica en la web"}
                  . No tienes que hacer nada más.
                </p>
              </div>
            </div>
            <Button asChild variant="outline">
              <a href={`/sepa/${token}/pdf`} download>
                <ArrowDownTrayIcon data-icon="inline-start" />
                Descargar mi copia firmada
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <StepTitle n={1}>Tus datos</StepTitle>
              </CardTitle>
              <CardDescription>Los del titular de la cuenta donde se cargarán los recibos.</CardDescription>
            </CardHeader>
            <CardContent>
              <SepaDebtorForm
                action={saveSepaDebtorAction.bind(null, token)}
                debtor={view.debtor}
                alreadySaved={view.readyToSign}
              />
            </CardContent>
          </Card>

          <Card className={view.readyToSign ? undefined : "opacity-60"}>
            <CardHeader>
              <CardTitle className="text-base">
                <StepTitle n={2}>Revisa el documento</StepTitle>
              </CardTitle>
              <CardDescription>
                {view.readyToSign
                  ? "Comprueba que todo es correcto. Si algo no lo es, corrígelo arriba y se actualizará."
                  : "Aparecerá aquí cuando guardes tus datos."}
              </CardDescription>
            </CardHeader>
            {view.readyToSign && (
              <CardContent className="space-y-3">
                <iframe
                  src={`/sepa/${token}/pdf?v=${encodeURIComponent(view.issuedAt ?? "")}`}
                  title="Orden de domiciliación SEPA"
                  className="h-[70vh] w-full rounded-md border"
                />
                <Button asChild variant="outline" size="sm">
                  <a href={`/sepa/${token}/pdf`} download>
                    <ArrowDownTrayIcon data-icon="inline-start" />
                    Descargar PDF
                  </a>
                </Button>
              </CardContent>
            )}
          </Card>

          <Card className={view.readyToSign ? undefined : "opacity-60"}>
            <CardHeader>
              <CardTitle className="text-base">
                <StepTitle n={3}>Firma</StepTitle>
              </CardTitle>
              <CardDescription>
                {view.readyToSign
                  ? "Elige cómo quieres firmar."
                  : "Disponible cuando hayas guardado tus datos y revisado el documento."}
              </CardDescription>
            </CardHeader>
            {view.readyToSign && view.debtor.signerName && (
              <CardContent>
                <SepaSignPanel
                  token={token}
                  signerName={view.debtor.signerName}
                  creditorName={creditor.name}
                  signWebAction={signSepaWebAction.bind(null, token)}
                  signCertificateAction={signSepaCertificateAction.bind(null, token)}
                />
              </CardContent>
            )}
          </Card>
        </>
      )}

      <p className="pb-4 text-center text-xs text-muted-foreground">
        ¿Dudas? Escribe a {creditor.email} o llama al {creditor.phone}.
      </p>
    </div>
  );
}
