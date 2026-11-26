import Link from "next/link";
import { ArrowDownTrayIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SepaMandateForm } from "@/components/platform/sepa-mandate-form";
import { SepaSigningPanel } from "@/components/platform/sepa-signing-panel";
import {
  cancelSepaMandateAction,
  issueSepaSigningLinkAction,
  saveSepaMandateAction,
} from "@/lib/actions/platform";
import { apiFetch } from "@/lib/api";
import type { CreditorCertificateStatus, TenantSepaMandate } from "@/lib/types";

export default async function TenantSepaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, certificate] = await Promise.all([
    apiFetch<TenantSepaMandate>(`/platform/tenants/${id}/sepa-mandate`),
    apiFetch<CreditorCertificateStatus>(
      "/platform/creditor-profile/certificate",
    ),
  ]);
  const certificateProblem = !certificate.configured
    ? "No hay certificado digital configurado: las órdenes saldrán sin tu firma."
    : !certificate.usable
      ? "El certificado digital no funciona: no se pueden generar órdenes ni el PDF."
      : certificate.expiringSoon
        ? `El certificado digital caduca en ${certificate.daysLeft} días.`
        : null;
  const action = saveSepaMandateAction.bind(null, id);

  return (
    <div className="space-y-4">
      <Link
        href={`/platform/${id}`}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        {data.tenantName}
      </Link>
      {certificateProblem && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <span>{certificateProblem}</span>
          <Link href="/platform/billing" className="font-medium underline">
            Ver certificado
          </Link>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Domiciliación SEPA</h1>
          <p className="text-sm text-muted-foreground">
            {data.mandate
              ? `Referencia ${data.mandate.reference}`
              : "Esta clínica aún no tiene orden SEPA."}
          </p>
        </div>
        {data.mandate && data.mandate.status !== "firmada" && (
          <Button asChild variant="outline">
            {/* A Route Handler streaming the PDF, not a page — plain <a>
                so Next doesn't try to client-navigate to it. */}
            <a href={`/platform/${id}/sepa/pdf`} download>
              <ArrowDownTrayIcon data-icon="inline-start" />
              Vista previa del PDF
            </a>
          </Button>
        )}
      </div>

      {data.mandate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Firma</CardTitle>
            <CardDescription>
              La clínica rellena sus datos y firma desde un enlace, en la web o
              con certificado digital.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SepaSigningPanel
              tenantId={id}
              mandate={data.mandate}
              issueLinkAction={issueSepaSigningLinkAction.bind(null, id)}
              cancelAction={cancelSepaMandateAction.bind(null, id)}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Condiciones de la orden</CardTitle>
          <CardDescription>
            Plan, cuota y fecha del primer cargo los fijas tú. Los datos del
            titular de la cuenta puedes dejarlos vacíos: los rellena la clínica
            al firmar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SepaMandateForm
            action={action}
            data={data}
            locked={data.mandate?.status === "firmada"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
