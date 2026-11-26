"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowPathIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  ChevronDownIcon,
  CircleStackIcon,
  ClockIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runBackupAction, restoreBackupAction } from "@/lib/actions/backups";

export interface BackupArtifact {
  id: string;
  run_id: string;
  tenant_id: string;
  tenant_name: string;
  size_bytes: string | null;
  status: "running" | "succeeded" | "failed";
  created_at: string;
  error_summary: string | null;
  mode: "manual" | "daily" | "pre_restore";
  run_status: "running" | "succeeded" | "partial" | "failed";
  started_at: string;
  finished_at: string | null;
  restored_at: string | null;
}

type BackupStatus = BackupArtifact["status"] | BackupArtifact["run_status"];
type BackupView = "runs" | "clinics";

interface BackupRunGroup {
  id: string;
  mode: BackupArtifact["mode"];
  status: BackupArtifact["run_status"];
  startedAt: string;
  artifacts: BackupArtifact[];
}

interface BackupClinicGroup {
  id: string;
  name: string;
  artifacts: BackupArtifact[];
}

const STATUS_LABELS: Record<
  BackupStatus,
  { label: string; className: string }
> = {
  running: {
    label: "En curso",
    className: "border-sky-200 bg-sky-50 text-sky-800",
  },
  succeeded: {
    label: "Completa",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  partial: {
    label: "Parcial",
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
  failed: {
    label: "Fallida",
    className: "border-red-200 bg-red-50 text-red-800",
  },
};

function dateTime(value: string): string {
  return new Date(value).toLocaleString("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function bytes(value: string | number | null): string {
  if (value === null) return "—";
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return "—";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function totalBytes(artifacts: BackupArtifact[]): number {
  return artifacts.reduce(
    (total, artifact) => total + (Number(artifact.size_bytes) || 0),
    0,
  );
}

function modeLabel(mode: BackupArtifact["mode"]): string {
  switch (mode) {
    case "daily":
      return "Diaria";
    case "pre_restore":
      return "Previo a restauración";
    default:
      return "Manual";
  }
}

function StatusChip({ status }: { status: BackupStatus }) {
  const item = STATUS_LABELS[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium ${item.className}`}
    >
      {item.label}
    </span>
  );
}

function ModeChip({ mode }: { mode: BackupArtifact["mode"] }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
      {modeLabel(mode)}
    </span>
  );
}

function groupByRun(artifacts: BackupArtifact[]): BackupRunGroup[] {
  const groups = new Map<string, BackupRunGroup>();

  for (const artifact of artifacts) {
    const id = artifact.run_id || artifact.id;
    const startedAt = artifact.started_at || artifact.created_at;
    const group = groups.get(id);

    if (group) {
      group.artifacts.push(artifact);
      if (Date.parse(startedAt) < Date.parse(group.startedAt)) {
        group.startedAt = startedAt;
      }
    } else {
      groups.set(id, {
        id,
        mode: artifact.mode,
        status: artifact.run_status,
        startedAt,
        artifacts: [artifact],
      });
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      artifacts: [...group.artifacts].sort((a, b) =>
        a.tenant_name.localeCompare(b.tenant_name, "es"),
      ),
    }))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

function groupByClinic(artifacts: BackupArtifact[]): BackupClinicGroup[] {
  const groups = new Map<string, BackupClinicGroup>();

  for (const artifact of artifacts) {
    const group = groups.get(artifact.tenant_id);
    if (group) {
      group.artifacts.push(artifact);
    } else {
      groups.set(artifact.tenant_id, {
        id: artifact.tenant_id,
        name: artifact.tenant_name,
        artifacts: [artifact],
      });
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      artifacts: [...group.artifacts].sort(
        (a, b) => Date.parse(b.started_at) - Date.parse(a.started_at),
      ),
    }))
    .sort(
      (a, b) =>
        Date.parse(b.artifacts[0]?.started_at ?? "") -
        Date.parse(a.artifacts[0]?.started_at ?? ""),
    );
}

function RestoreButton({
  artifact,
  pending,
  canRun,
  onRestore,
  label = "Restaurar",
}: {
  artifact: BackupArtifact;
  pending: boolean;
  canRun: boolean;
  onRestore: (artifact: BackupArtifact) => void;
  label?: string;
}) {
  if (artifact.status !== "succeeded") return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => onRestore(artifact)}
      disabled={pending || !canRun}
      aria-label={`Restaurar la copia de ${artifact.tenant_name} del ${dateTime(artifact.started_at)}`}
      className="shrink-0"
    >
      <ArrowPathIcon data-icon="inline-start" />
      {label}
    </Button>
  );
}

export function BackupOperations({
  artifacts,
  canRun,
}: {
  artifacts: BackupArtifact[];
  canRun: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [restore, setRestore] = useState<BackupArtifact | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [view, setView] = useState<BackupView>("runs");
  const [search, setSearch] = useState("");

  const runs = useMemo(() => groupByRun(artifacts), [artifacts]);
  const clinics = useMemo(() => groupByClinic(artifacts), [artifacts]);
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const visibleRuns = runs
    .map((run) => ({
      ...run,
      visibleArtifacts: normalizedSearch
        ? run.artifacts.filter((artifact) =>
            artifact.tenant_name
              .toLocaleLowerCase("es")
              .includes(normalizedSearch),
          )
        : run.artifacts,
    }))
    .filter((run) => run.visibleArtifacts.length > 0);
  const visibleClinics = clinics.filter((clinic) =>
    clinic.name.toLocaleLowerCase("es").includes(normalizedSearch),
  );

  const completedArtifacts = artifacts.filter(
    (artifact) => artifact.status === "succeeded",
  );
  const protectedClinics = new Set(
    completedArtifacts.map((artifact) => artifact.tenant_id),
  ).size;
  const latestCompletedRun = runs.find((run) => run.status === "succeeded");
  const displayedClinicCount =
    view === "runs"
      ? visibleRuns.reduce(
          (count, run) => count + run.visibleArtifacts.length,
          0,
        )
      : visibleClinics.length;

  function runNow() {
    setRunning(true);
    setRunMessage(null);
    setRunError(null);
    startTransition(async () => {
      const result = await runBackupAction();
      setRunMessage(result.message ?? null);
      setRunError(result.error ?? null);
      setRunning(false);
      router.refresh();
    });
  }

  function beginRestore(artifact: BackupArtifact) {
    setRestore(artifact);
    setConfirmation("");
    setRestoreMessage(null);
    setRestoreError(null);
  }

  function cancelRestore() {
    setRestore(null);
    setConfirmation("");
  }

  function confirmRestore() {
    if (!restore) return;
    const selected = restore;
    setRestoreError(null);
    setRestoreMessage(null);
    startTransition(async () => {
      const result = await restoreBackupAction(selected.id, confirmation);
      setRestoreMessage(result.message ?? null);
      setRestoreError(result.error ?? null);
      if (result.message) cancelRestore();
      router.refresh();
    });
  }

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-background p-5">
        <div className="min-w-0">
          <h2 className="font-semibold">Ejecución de copias</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Una vez al día, programada a las 02:30 (hora de Madrid). Si el
            servicio se reinicia después, lanza la copia del día al recuperarse.
            Conservación: 30 días.
          </p>
          {!canRun && (
            <p className="mt-2 text-sm text-amber-800">
              Verifica la conexión con Backblaze B2 para habilitar las copias.
            </p>
          )}
        </div>
        <Button onClick={runNow} disabled={pending || running || !canRun}>
          <CircleStackIcon data-icon="inline-start" />
          {running ? "Creando copias…" : "Crear copia ahora"}
        </Button>
        {runMessage && (
          <p role="status" className="w-full text-sm">
            {runMessage}
          </p>
        )}
        {runError && (
          <p role="alert" className="w-full text-sm text-destructive">
            {runError}
          </p>
        )}
      </section>

      <section aria-labelledby="backup-history-heading" className="space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <ClockIcon aria-hidden className="size-5 text-primary" />
              <h2 id="backup-history-heading" className="text-lg font-semibold">
                Historial de copias
              </h2>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Encuentra una fecha o una clínica y restaura solo esa copia. Antes
              de cada restauración se guarda el estado actual.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <ClockIcon aria-hidden className="size-4" />
            Retención: 30 días
          </span>
        </header>

        <dl className="grid grid-cols-2 gap-4 rounded-md border-y bg-muted/20 py-4 sm:grid-cols-4">
          <div className="px-4">
            <dt className="text-xs font-medium text-muted-foreground">
              Clínicas protegidas
            </dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {protectedClinics}
            </dd>
          </div>
          <div className="px-4">
            <dt className="text-xs font-medium text-muted-foreground">
              Copias disponibles
            </dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {completedArtifacts.length}
            </dd>
          </div>
          <div className="px-4">
            <dt className="text-xs font-medium text-muted-foreground">
              Espacio guardado
            </dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {bytes(totalBytes(completedArtifacts))}
            </dd>
          </div>
          <div className="px-4">
            <dt className="text-xs font-medium text-muted-foreground">
              Última ejecución completa
            </dt>
            <dd className="mt-1 text-sm font-semibold leading-6">
              {latestCompletedRun
                ? dateTime(latestCompletedRun.startedAt)
                : "—"}
            </dd>
          </div>
        </dl>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block min-w-0 sm:w-80">
            <span className="sr-only">Buscar por clínica</span>
            <MagnifyingGlassIcon
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por clínica…"
              className="pl-9"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
            <div
              role="group"
              aria-label="Agrupar el historial"
              className="inline-flex rounded-lg border bg-muted/40 p-1"
            >
              <button
                type="button"
                aria-pressed={view === "runs"}
                onClick={() => setView("runs")}
                className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${view === "runs" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Por ejecución
              </button>
              <button
                type="button"
                aria-pressed={view === "clinics"}
                onClick={() => setView("clinics")}
                className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${view === "clinics" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Por clínica
              </button>
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {displayedClinicCount}{" "}
              {view === "runs" ? "copias visibles" : "clínicas visibles"}
            </p>
          </div>
        </div>

        {artifacts.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-background px-5 py-10 text-center">
            <CircleStackIcon
              aria-hidden
              className="mx-auto size-8 text-muted-foreground"
            />
            <h3 className="mt-3 font-medium">Aún no hay copias guardadas</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Cuando termine la primera ejecución, sus copias aparecerán aquí.
            </p>
          </div>
        ) : view === "runs" ? (
          visibleRuns.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-background px-5 py-8 text-center text-sm text-muted-foreground">
              No hay copias de clínicas que coincidan con «{search}».
            </p>
          ) : (
            <div className="space-y-3">
              {visibleRuns.map((run, index) => {
                const completeCount = run.artifacts.filter(
                  (artifact) => artifact.status === "succeeded",
                ).length;

                return (
                  <details
                    key={run.id}
                    open={index === 0}
                    className="group overflow-hidden rounded-lg border bg-background"
                  >
                    <summary className="flex list-none cursor-pointer flex-col gap-3 p-4 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:flex-row sm:items-center [&::-webkit-details-marker]:hidden">
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <CalendarDaysIcon aria-hidden className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <time
                            dateTime={run.startedAt}
                            className="font-semibold"
                          >
                            {dateTime(run.startedAt)}
                          </time>
                          <ModeChip mode={run.mode} />
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {completeCount} de {run.artifacts.length} clínicas con
                          copia · {bytes(totalBytes(run.artifacts))}
                        </span>
                      </span>
                      <StatusChip status={run.status} />
                      <ChevronDownIcon
                        aria-hidden
                        className="hidden size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 sm:block"
                      />
                    </summary>
                    <div className="border-t px-4 pb-1 sm:px-5">
                      {normalizedSearch &&
                        run.visibleArtifacts.length !==
                          run.artifacts.length && (
                          <p className="pt-3 text-xs text-muted-foreground">
                            Mostrando {run.visibleArtifacts.length} de{" "}
                            {run.artifacts.length} clínicas de esta ejecución.
                          </p>
                        )}
                      <div className="grid gap-x-8 sm:grid-cols-2">
                        {run.visibleArtifacts.map((artifact) => (
                          <div
                            key={artifact.id}
                            className="flex min-w-0 items-center justify-between gap-3 border-b py-3.5 last:border-b-0"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {artifact.tenant_name}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <StatusChip status={artifact.status} />
                                <span>{bytes(artifact.size_bytes)}</span>
                                {artifact.restored_at && (
                                  <span>
                                    Restaurada {dateTime(artifact.restored_at)}
                                  </span>
                                )}
                              </div>
                              {artifact.error_summary && (
                                <p className="mt-1 text-xs text-destructive">
                                  {artifact.error_summary}
                                </p>
                              )}
                            </div>
                            <RestoreButton
                              artifact={artifact}
                              pending={pending}
                              canRun={canRun}
                              onRestore={beginRestore}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          )
        ) : visibleClinics.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-background px-5 py-8 text-center text-sm text-muted-foreground">
            No hay clínicas que coincidan con «{search}».
          </p>
        ) : (
          <div className="space-y-3">
            {visibleClinics.map((clinic, index) => {
              const latest = clinic.artifacts[0];
              const completeCount = clinic.artifacts.filter(
                (artifact) => artifact.status === "succeeded",
              ).length;

              return (
                <details
                  key={clinic.id}
                  open={index === 0}
                  className="group overflow-hidden rounded-lg border bg-background"
                >
                  <summary className="flex list-none cursor-pointer flex-col gap-3 p-4 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:flex-row sm:items-center [&::-webkit-details-marker]:hidden">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <BuildingOffice2Icon aria-hidden className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {clinic.name}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        Última copia {dateTime(latest.started_at)} ·{" "}
                        {completeCount} disponibles
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusChip status={latest.status} />
                      <span className="text-xs text-muted-foreground">
                        {clinic.artifacts.length}{" "}
                        {clinic.artifacts.length === 1 ? "copia" : "copias"}
                      </span>
                    </span>
                    <ChevronDownIcon
                      aria-hidden
                      className="hidden size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 sm:block"
                    />
                  </summary>
                  <ul className="divide-y border-t px-4 sm:px-5">
                    {clinic.artifacts.map((artifact) => (
                      <li
                        key={artifact.id}
                        className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <time
                              dateTime={artifact.started_at}
                              className="text-sm font-medium"
                            >
                              {dateTime(artifact.started_at)}
                            </time>
                            <ModeChip mode={artifact.mode} />
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <StatusChip status={artifact.status} />
                            <span>{bytes(artifact.size_bytes)}</span>
                            {artifact.restored_at && (
                              <span>
                                Restaurada {dateTime(artifact.restored_at)}
                              </span>
                            )}
                          </div>
                          {artifact.error_summary && (
                            <p className="text-xs text-destructive">
                              {artifact.error_summary}
                            </p>
                          )}
                        </div>
                        <RestoreButton
                          artifact={artifact}
                          pending={pending}
                          canRun={canRun}
                          onRestore={beginRestore}
                          label="Restaurar esta copia"
                        />
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        )}

        {restoreMessage && (
          <p
            role="status"
            className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
          >
            {restoreMessage}
          </p>
        )}
        {restoreError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {restoreError}
          </p>
        )}
      </section>

      {restore && (
        <section
          className="space-y-4 rounded-lg border border-destructive/40 bg-destructive/5 p-5"
          aria-label="Confirmar restauración"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
              Confirmación necesaria
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              Restaurar {restore.tenant_name}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Se reemplazarán los datos de esta clínica por los de la copia del{" "}
              {dateTime(restore.started_at)}. Escribe el nombre de la clínica
              para confirmar.
            </p>
          </div>
          <Input
            aria-label="Nombre de la clínica para confirmar"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="Nombre exacto de la clínica"
            autoComplete="off"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={
                pending || !canRun || confirmation !== restore.tenant_name
              }
              onClick={confirmRestore}
            >
              {pending ? "Restaurando…" : "Confirmar restauración"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={cancelRestore}
            >
              Cancelar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Antes de aplicar la copia, se guardará el estado actual como copia
            de seguridad.
          </p>
        </section>
      )}
    </div>
  );
}
