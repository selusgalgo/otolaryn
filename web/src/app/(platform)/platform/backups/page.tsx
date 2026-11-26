import { apiFetch } from "@/lib/api";
import { BackupConfigurationForm } from "@/components/platform/backup-configuration-form";
import {
  BackupOperations,
  type BackupArtifact,
} from "@/components/platform/backup-operations";

type Connection = {
  configured: boolean;
  connected: boolean;
  bucket: string | null;
  region: string | null;
};

export default async function BackupsPage() {
  const [connection, artifacts] = await Promise.all([
    apiFetch<Connection>("/platform/backups/connection"),
    apiFetch<BackupArtifact[]>("/platform/backups"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Copias de seguridad</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Protección de las clínicas en Backblaze B2.
        </p>
      </div>
      {!connection.configured && (
        <div
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          Configura primero Backblaze B2 para poder crear copias.
        </div>
      )}
      {connection.configured && !connection.connected && (
        <div
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          No se ha podido comprobar el bucket. Revisa su configuración antes de
          crear copias.
        </div>
      )}
      <section className="space-y-3 rounded-md border bg-background p-5">
        <h2 className="font-semibold">Conexión con Backblaze B2</h2>
        <p className="text-sm">
          {!connection.configured
            ? "Pendiente de configurar"
            : connection.connected
              ? "Conexión verificada"
              : "No se ha podido verificar la conexión"}
        </p>
        {connection.configured && (
          <p className="text-sm text-muted-foreground">
            Depósito: {connection.bucket} · Región: {connection.region}
          </p>
        )}
        <BackupConfigurationForm
          bucket={connection.bucket}
          region={connection.region}
        />
      </section>
      {(connection.configured || artifacts.length > 0) && (
        <BackupOperations
          artifacts={artifacts}
          canRun={connection.configured && connection.connected}
        />
      )}
    </div>
  );
}
