import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CertificateStatus } from "@/components/platform/certificate-status";
import { CreditorProfileForm } from "@/components/platform/creditor-profile-form";
import { updateCreditorProfileAction } from "@/lib/actions/platform";
import { apiFetch } from "@/lib/api";
import type { CreditorCertificateStatus, CreditorProfile } from "@/lib/types";

export default async function BillingPage() {
  const [creditor, certificate] = await Promise.all([
    apiFetch<CreditorProfile>("/platform/creditor-profile"),
    apiFetch<CreditorCertificateStatus>("/platform/creditor-profile/certificate"),
  ]);

  // Seeded empty by the migration (the repository is public, so the creditor's
  // real details are never committed): nothing can be issued until they're set.
  const creditorComplete = [
    creditor.name,
    creditor.taxId,
    creditor.address,
    creditor.postalCode,
    creditor.city,
    creditor.province,
    creditor.country,
    creditor.email,
    creditor.phone,
    creditor.sepaCreditorId,
  ].every((value) => value.trim() !== "");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Datos de facturación</h1>
      {!creditorComplete && (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Faltan los datos del acreedor.</p>
          <p>
            Complétalos y guarda el formulario: hasta entonces no se puede generar ninguna orden de domiciliación ni
            instalar el certificado digital.
          </p>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acreedor SEPA</CardTitle>
          <CardDescription>
            Aparecen como acreedor en todas las órdenes de domiciliación que se generan para las clínicas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreditorProfileForm action={updateCreditorProfileAction} initialProfile={creditor} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Certificado digital</CardTitle>
          <CardDescription>
            Con él se firma automáticamente cada orden de domiciliación antes de enviarla a la clínica.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CertificateStatus status={certificate} creditorTaxId={creditor.taxId} />
        </CardContent>
      </Card>
    </div>
  );
}
