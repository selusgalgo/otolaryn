import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { CertificateManager } from "@/components/platform/certificate-manager";
import { cn } from "@/lib/utils";
import type { CreditorCertificateStatus } from "@/lib/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { dateStyle: "long" });
}

function Notice({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "error";
  children: React.ReactNode;
}) {
  const Icon =
    tone === "ok"
      ? CheckCircleIcon
      : tone === "warn"
        ? ExclamationTriangleIcon
        : XCircleIcon;
  return (
    <div
      role={tone === "ok" ? undefined : "alert"}
      className={cn(
        "flex items-start gap-2 rounded-md border p-3 text-sm",
        tone === "ok" && "border-emerald-300 bg-emerald-50 text-emerald-900",
        tone === "warn" && "border-amber-300 bg-amber-50 text-amber-900",
        tone === "error" && "border-red-300 bg-red-50 text-red-900",
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// The alternative to uploading: the file and passphrase set in the server's
// environment. Kept out of the way — uploading from this panel is the normal
// route — but still supported, and an upload takes priority over it.
function ServerSetupNote() {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">
        Avanzado: configurarlo desde el servidor
      </summary>
      <p className="pt-2">
        En el <code className="text-foreground">.env</code> del backend, con el
        archivo guardado fuera de las carpetas web:{" "}
        <code className="text-foreground">CREDITOR_P12_PATH</code> (ruta del
        .p12) y <code className="text-foreground">CREDITOR_P12_PASSPHRASE</code>{" "}
        (su contraseña), y reiniciar el backend.
      </p>
    </details>
  );
}

export function CertificateStatus({
  status,
  creditorTaxId,
}: {
  status: CreditorCertificateStatus;
  creditorTaxId: string;
}) {
  if (!status.configured) {
    return (
      <div className="space-y-4">
        <Notice tone="warn">
          <p className="font-medium">No hay certificado instalado.</p>
          <p>Las órdenes de domiciliación se generan sin tu firma digital.</p>
        </Notice>
        <p className="text-sm text-muted-foreground">
          Arrastra tu archivo .p12 e indica su contraseña: si son correctos, el
          certificado queda instalado y firma las órdenes desde ese momento.
        </p>
        <CertificateManager source={null} expanded />
        <ServerSetupNote />
      </div>
    );
  }

  if (!status.usable) {
    return (
      <div className="space-y-4">
        <Notice tone="error">
          <p className="font-medium">El certificado no se puede usar.</p>
          <p>{status.error}</p>
          <p>
            Mientras no se arregle, no se pueden generar órdenes: no se enviará
            nunca un documento sin firmar.
          </p>
        </Notice>
        <CertificateManager source={status.source} expanded />
        <ServerSetupNote />
      </div>
    );
  }

  const { certificate: c } = status;
  const rows: [string, string][] = [
    ["Titular", c.subject],
    ["Emitido por", c.issuer],
    ["Válido hasta", `${formatDate(c.validTo)} (${status.daysLeft} días)`],
    ["Número de serie", c.serialNumber],
    ["Huella SHA-256", c.sha256Fingerprint],
  ];

  return (
    <div className="space-y-4">
      <Notice tone="ok">
        <p className="font-medium">Certificado operativo.</p>
        <p>
          Cada orden se firma automáticamente con él antes de enviarse al
          cliente.
        </p>
      </Notice>
      {!status.matchesCreditorTaxId && (
        <Notice tone="error">
          <p className="font-medium">
            El certificado no corresponde al NIF del acreedor ({creditorTaxId}).
          </p>
          <p>
            Las órdenes llevarían la firma de otra persona. Instala el
            certificado correcto.
          </p>
        </Notice>
      )}
      {status.expiringSoon && (
        <Notice tone="warn">
          <p className="font-medium">Caduca en {status.daysLeft} días.</p>
          <p>
            Renueva el certificado y sustituye el archivo en el servidor antes
            de esa fecha.
          </p>
        </Notice>
      )}
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-all font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <CertificateManager
        source={status.source}
        expanded={!status.matchesCreditorTaxId}
      />
      <ServerSetupNote />
    </div>
  );
}
