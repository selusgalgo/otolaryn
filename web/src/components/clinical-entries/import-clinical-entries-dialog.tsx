"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { FileDropzone } from "@/components/patients/file-dropzone";
import { ImportClinicalEntriesColumnMapping } from "@/components/clinical-entries/import-clinical-entries-column-mapping";
import { ImportClinicalEntriesDoctorMapping } from "@/components/clinical-entries/import-clinical-entries-doctor-mapping";
import {
  continueClinicalEntriesImportJobAction,
  getDistinctDoctorsAction,
  previewClinicalEntriesImportAction,
  startImportClinicalEntriesAction,
} from "@/lib/actions/clinical-entries-import";
import type {
  ClinicalEntriesImportPreview,
  ClinicalEntryColumnMapping,
  ImportJobProgress,
} from "@/lib/actions/clinical-entries-import";
import type { PractitionerOption } from "@/lib/practitioners";

const ACCEPT =
  ".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface ImportClinicalEntriesDialogProps {
  practitioners?: PractitionerOption[] | null;
  // Controlled open state, so a parent "Acciones" menu can open this
  // without rendering its own trigger button — same pattern as
  // NewAppointmentDialog's open/onOpenChange/hideTrigger. Uncontrolled
  // (internal state, own trigger) by default.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

type Step = "upload" | "mapping" | "doctors";

// Vive junto al "Importar" de Pacientes (no dentro de la ficha de un
// paciente) porque una sola importación de consultas.xls reparte filas
// entre miles de pacientes distintos, cada uno resuelto por su propio
// Nº de historia — no tiene sentido atarlo a un paciente concreto.
//
// Tres pasos, cada uno con su propia llamada al backend (nada de estado
// del asistente persistido en el servidor entre pasos): 1) subir el
// fichero y confirmar el mapeo de columnas, 2) si se mapeó una columna de
// médico, resolver cada nombre distinto a un profesional real, 3)
// importar de verdad con ambos mapeos ya confirmados.
export function ImportClinicalEntriesDialog({
  practitioners,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  hideTrigger = false,
}: ImportClinicalEntriesDialogProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChangeProp ?? setOpenState;
  const [step, setStep] = useState<Step>("upload");
  const [pending, startTransition] = useTransition();
  const [dropzoneKey, setDropzoneKey] = useState(0);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ClinicalEntriesImportPreview | null>(null);
  const [mapping, setMapping] = useState<ClinicalEntryColumnMapping>({});
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [doctorNames, setDoctorNames] = useState<string[]>([]);
  const [doctorMapping, setDoctorMapping] = useState<Record<string, string | undefined>>({});

  const [progress, setProgress] = useState<ImportJobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards an in-flight poll loop from continuing after the dialog is
  // reset/closed (a small file can still have a batch in flight).
  const cancelledRef = useRef(false);

  function reset() {
    cancelledRef.current = true;
    setStep("upload");
    setDropzoneKey((k) => k + 1);
    setFile(null);
    setPreview(null);
    setMapping({});
    setPreviewError(null);
    setDoctorNames([]);
    setDoctorMapping({});
    setProgress(null);
    setError(null);
  }

  function handleFileSelected(selected: File) {
    setFile(selected);
    setPreview(null);
    setMapping({});
    setPreviewError(null);
    setProgress(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", selected, selected.name);
      const state = await previewClinicalEntriesImportAction(fd);
      if (state.error) {
        setPreviewError(state.error);
      } else if (state.preview) {
        setPreview(state.preview);
        setMapping(state.preview.suggestedMapping);
        setStep("mapping");
      }
    });
  }

  function goToDoctors() {
    if (!file) return;
    setError(null);
    if (!mapping.doctorName) {
      // Sin columna de médico mapeada no hay nada que resolver — se pasa
      // igualmente al paso siguiente (la lista de médicos queda vacía y
      // no se muestra nada) en vez de importar aquí mismo sin que la
      // persona lo pida explícitamente; el backend reportará cada fila
      // omitida por falta de médico al pulsar "Importar".
      setDoctorNames([]);
      setStep("doctors");
      return;
    }
    startTransition(async () => {
      const state = await getDistinctDoctorsAction(file, mapping);
      if (state.error) {
        setError(state.error);
        return;
      }
      setDoctorNames(state.doctorNames ?? []);
      setStep("doctors");
    });
  }

  // Runs as a job processed in small batches (see ImportJobsService on
  // the backend), not one request that waits for every row — a legacy
  // consultas.xls has thousands of rows, each needing its own sequential
  // DB round trips, which blows through Vercel's 300s function timeout if
  // done in one call. startImportClinicalEntriesAction kicks the job off;
  // this then polls continueClinicalEntriesImportJobAction, advancing the
  // progress bar with each batch, until the job reports done.
  function runImport(finalDoctorMapping: Record<string, string | undefined>) {
    if (!file) return;
    setError(null);
    cancelledRef.current = false;
    startTransition(async () => {
      const cleaned: Record<string, string> = {};
      for (const [name, userId] of Object.entries(finalDoctorMapping)) {
        if (userId) cleaned[name] = userId;
      }
      const start = await startImportClinicalEntriesAction(file, mapping, cleaned);
      if (start.error || !start.progress) {
        setError(start.error ?? "No se pudo importar el fichero.");
        return;
      }

      let current = start.progress;
      setProgress(current);
      while (current.status !== "completed" && !cancelledRef.current) {
        const next = await continueClinicalEntriesImportJobAction(current.jobId);
        if (next.error || !next.progress) {
          setError(next.error ?? "No se pudo continuar la importación.");
          return;
        }
        current = next.progress;
        setProgress(current);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline">
            <ArrowUpTrayIcon data-icon="inline-start" />
            Importar consultas
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar consultas</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Fichero</Label>
            <FileDropzone
              key={dropzoneKey}
              name="file"
              accept={ACCEPT}
              disabled={pending}
              hint="CSV, XLS o XLSX"
              onFileSelected={handleFileSelected}
            />
            {!preview && (
              <p className="text-xs text-muted-foreground">
                Cada fila se relaciona con un paciente ya importado por su Nº de historia
                (NUMHISTORIA), nunca por el nombre.
              </p>
            )}
          </div>

          {pending && step === "upload" && (
            <p className="text-sm text-muted-foreground">Leyendo el fichero…</p>
          )}
          {previewError && <p className="text-sm text-destructive">{previewError}</p>}

          {preview && (step === "mapping" || step === "doctors") && (
            <ImportClinicalEntriesColumnMapping
              preview={preview}
              mapping={mapping}
              onChange={setMapping}
              disabled={pending || step === "doctors"}
            />
          )}

          {step === "doctors" && doctorNames.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No se mapeó ninguna columna de médico — todas las filas se omitirán al importar
              (author_user_id es obligatorio en cada consulta). Vuelve atrás si quieres mapearla.
            </p>
          )}
          {step === "doctors" && (
            <ImportClinicalEntriesDoctorMapping
              doctorNames={doctorNames}
              practitioners={practitioners ?? []}
              mapping={doctorMapping}
              onChange={setDoctorMapping}
              disabled={pending}
            />
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {progress && (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span>
                  {progress.processedRows} de {progress.totalRows} filas procesadas
                </span>
                <span className="text-muted-foreground">
                  {progress.totalRows > 0
                    ? Math.round((progress.processedRows / progress.totalRows) * 100)
                    : 0}
                  %
                </span>
              </div>
              <Progress value={progress.processedRows} max={progress.totalRows} />
              {progress.status === "completed" && (
                <>
                  <p>
                    <span className="font-medium">{progress.created}</span> de{" "}
                    {progress.totalRows} consultas importadas.
                  </p>
                  {progress.skipped.length > 0 && (
                    <div className="space-y-1">
                      <p className="font-medium text-destructive">
                        {progress.skipped.length} fila{progress.skipped.length === 1 ? "" : "s"}{" "}
                        omitida{progress.skipped.length === 1 ? "" : "s"}:
                      </p>
                      <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                        {progress.skipped.map((s) => (
                          <li key={s.row}>
                            Fila {s.row}: {s.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {preview && !progress && step === "mapping" && (
            <Button type="button" onClick={goToDoctors} disabled={pending} className="w-fit">
              {pending ? "Comprobando..." : "Siguiente"}
            </Button>
          )}
          {step === "doctors" && !progress && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("mapping")}
                disabled={pending}
              >
                Volver
              </Button>
              <Button
                type="button"
                onClick={() => runImport(doctorMapping)}
                disabled={pending}
                className="w-fit"
              >
                {pending ? (
                  "Importando..."
                ) : (
                  <>
                    <ArrowUpTrayIcon data-icon="inline-start" />
                    Importar
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
