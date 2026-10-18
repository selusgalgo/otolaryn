"use client";

import { useRef, useState } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { FileDropzone } from "@/components/patients/file-dropzone";
import { UpdateColumnMappingForm } from "@/components/patients/update-column-mapping";
import {
  continueUpdateJobAction,
  previewPatientsUpdateAction,
  startUpdatePatientsAction,
} from "@/lib/actions/patients";
import type { ImportJobProgress, UpdateColumnMapping, UpdateImportPreview } from "@/lib/actions/patients";
import type { AntecedenteType } from "@/lib/types";

const ACCEPT =
  ".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Modo "actualizar pacientes": a diferencia de ImportPatientsDialog, nunca
// crea pacientes nuevos — localiza cada fila por su Nº de historia y solo
// toca Primera consulta y antecedentes en el paciente ya existente. Mismo
// patrón de job por lotes (ver ImportJobsService) para no bloquear la
// petición con ficheros de miles de filas.
interface UpdatePatientsDialogProps {
  antecedenteTypes?: AntecedenteType[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function UpdatePatientsDialog({
  antecedenteTypes,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  hideTrigger = false,
}: UpdatePatientsDialogProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChangeProp ?? setOpenState;
  const formRef = useRef<HTMLFormElement>(null);
  const [dropzoneKey, setDropzoneKey] = useState(0);

  const [preview, setPreview] = useState<UpdateImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [mapping, setMapping] = useState<UpdateColumnMapping>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportJobProgress | null>(null);
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
      const result = await previewPatientsUpdateAction(fd);
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

    const start = await startUpdatePatientsAction(selectedFile, mapping);
    if (start.error || !start.progress) {
      setImportError(start.error ?? "No se pudo importar el fichero.");
      setImporting(false);
      return;
    }

    let current = start.progress;
    setProgress(current);
    while (current.status !== "completed" && !cancelledRef.current) {
      const next = await continueUpdateJobAction(current.jobId);
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
            <ArrowPathIcon data-icon="inline-start" />
            Actualizar pacientes
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Actualizar pacientes</DialogTitle>
        </DialogHeader>
        <form ref={formRef} className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
          <p className="text-xs text-muted-foreground">
            Localiza a cada paciente por su Nº de historia y actualiza solo Primera consulta,
            Historia clínica y antecedentes — el resto de la ficha no se modifica. Un paciente sin
            Nº de historia coincidente se omite (créalo primero desde Importar pacientes).
          </p>
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
          </div>

          {previewLoading && <p className="text-sm text-muted-foreground">Leyendo el fichero…</p>}
          {previewError && <p className="text-sm text-destructive">{previewError}</p>}

          {preview && (
            <UpdateColumnMappingForm
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
                    {progress.totalRows} pacientes actualizados.
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
              disabled={importing || !mapping.legacyId}
              className="w-fit"
            >
              {importing ? (
                "Actualizando..."
              ) : (
                <>
                  <ArrowPathIcon data-icon="inline-start" />
                  Actualizar
                </>
              )}
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
