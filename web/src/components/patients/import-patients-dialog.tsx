"use client";

import { useRef, useState } from "react";
import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { FileDropzone } from "@/components/patients/file-dropzone";
import { ImportColumnMapping } from "@/components/patients/import-column-mapping";
import {
  continueImportJobAction,
  previewPatientsImportAction,
  startImportPatientsAction,
} from "@/lib/actions/patients";
import type { ColumnMapping, ImportJobProgress, ImportPreview } from "@/lib/actions/patients";
import type { AntecedenteType } from "@/lib/types";

const ACCEPT =
  ".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// documentId excluded on purpose — see the matching REQUIRED_FIELDS
// comment in patients-csv.util.ts: Documento is optional on the patient
// itself, a row with no mapped column just imports without one.
const REQUIRED_FIELDS: (keyof ColumnMapping)[] = [
  "firstName",
  "lastName",
  "dateOfBirth",
  "phone",
];

function isMappingComplete(mapping: ColumnMapping): boolean {
  return REQUIRED_FIELDS.every((field) => !!mapping[field]);
}

// Two steps: 1) pick a file, read its real columns (previewPatientsImportAction,
// no patient created yet); 2) confirm/fix which column feeds which field,
// then actually import. A file from another system — the legacy OTOLARYN
// desktop app's own NUMHISTORIA as this app's Documento, say — won't match
// the suggested mapping at all, which is exactly why this step exists
// instead of importing on a silent guess.
//
// The import itself runs as a job processed in small batches (see
// ImportJobsService on the backend) rather than one request that waits for
// every row — a legacy file has thousands of rows, each needing its own
// sequential DB round trips, which blows straight through Vercel's 300s
// function timeout if done in one call. startImportPatientsAction kicks the
// job off; this component then polls continueImportJobAction in a loop,
// advancing the progress bar with each batch, until the job reports done.
//
// Doesn't auto-close on a successful import like the other dialogs
// (CreatePatientDialog etc.) — a partial import (some rows skipped) is the
// expected common case here, not an error, and the user needs to actually
// read which rows and why before dismissing it themselves.
interface ImportPatientsDialogProps {
  antecedenteTypes?: AntecedenteType[];
  // Controlled open state, so a parent "Acciones" menu can open this
  // without rendering its own trigger button — same pattern as
  // NewAppointmentDialog's open/onOpenChange/hideTrigger. Uncontrolled
  // (internal state, own trigger) by default.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function ImportPatientsDialog({
  antecedenteTypes,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  hideTrigger = false,
}: ImportPatientsDialogProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChangeProp ?? setOpenState;
  const formRef = useRef<HTMLFormElement>(null);
  // Bumped on close to remount FileDropzone fresh — form.reset() clears the
  // underlying <input>, but not the dropzone's own "selected file" label.
  const [dropzoneKey, setDropzoneKey] = useState(0);

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportJobProgress | null>(null);
  // A batch can finish a job in one call (a small file) — guards the loop
  // against ever polling an already-completed job.
  const cancelledRef = useRef(false);

  function reset() {
    cancelledRef.current = true;
    formRef.current?.reset();
    setDropzoneKey((k) => k + 1);
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(false);
    setMapping({});
    setSelectedFile(null);
    setImporting(false);
    setImportError(null);
    setProgress(null);
  }

  async function handleFileSelected(file: File) {
    setPreview(null);
    setPreviewError(null);
    setMapping({});
    setSelectedFile(file);
    setPreviewLoading(true);
    try {
      const fd = new FormData();
      fd.set("file", file, file.name);
      const result = await previewPatientsImportAction(fd);
      if (result.error) {
        setPreviewError(result.error);
      } else if (result.preview) {
        setPreview(result.preview);
        setMapping(result.preview.suggestedMapping);
      }
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleImport() {
    if (!selectedFile) return;
    cancelledRef.current = false;
    setImportError(null);
    setImporting(true);
    setProgress(null);

    const start = await startImportPatientsAction(selectedFile, mapping);
    if (start.error || !start.progress) {
      setImportError(start.error ?? "No se pudo importar el fichero.");
      setImporting(false);
      return;
    }

    let current = start.progress;
    setProgress(current);
    while (current.status !== "completed" && !cancelledRef.current) {
      const next = await continueImportJobAction(current.jobId);
      if (next.error || !next.progress) {
        setImportError(next.error ?? "No se pudo continuar la importación.");
        break;
      }
      current = next.progress;
      setProgress(current);
    }
    setImporting(false);
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
            Importar
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar pacientes</DialogTitle>
        </DialogHeader>
        <form ref={formRef} className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
          <div className="space-y-2">
            <Label>Fichero</Label>
            <FileDropzone
              key={dropzoneKey}
              name="file"
              accept={ACCEPT}
              disabled={importing || previewLoading}
              hint="CSV, XLS o XLSX"
              onFileSelected={(file) => void handleFileSelected(file)}
            />
            {!preview && (
              <p className="text-xs text-muted-foreground">
                Se leerán primero las columnas del fichero para que confirmes a qué campo corresponde
                cada una — por ejemplo, un NUMHISTORIA de otro programa puede ser el Documento aquí.
              </p>
            )}
          </div>

          {previewLoading && <p className="text-sm text-muted-foreground">Leyendo el fichero…</p>}
          {previewError && <p className="text-sm text-destructive">{previewError}</p>}

          {preview && (
            <ImportColumnMapping
              preview={preview}
              mapping={mapping}
              onChange={setMapping}
              disabled={importing}
              antecedenteTypes={antecedenteTypes}
            />
          )}

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
                    {progress.totalRows} pacientes importados.
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

          {importError && <p className="text-sm text-destructive">{importError}</p>}

          {preview && (
            <Button
              type="button"
              onClick={() => void handleImport()}
              disabled={importing || !isMappingComplete(mapping)}
              className="w-fit"
            >
              {importing ? (
                "Importando..."
              ) : (
                <>
                  <ArrowUpTrayIcon data-icon="inline-start" />
                  Importar
                </>
              )}
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
