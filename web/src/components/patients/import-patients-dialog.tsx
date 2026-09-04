"use client";

import { useActionState, useRef, useState } from "react";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { FileDropzone } from "@/components/patients/file-dropzone";
import { ImportColumnMapping } from "@/components/patients/import-column-mapping";
import { importPatientsAction, previewPatientsImportAction } from "@/lib/actions/patients";
import type { ColumnMapping, ImportPatientsState, ImportPreview } from "@/lib/actions/patients";

const initialState: ImportPatientsState = {};

const ACCEPT =
  ".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// documentId excluded on purpose — see the matching REQUIRED_FIELDS
// comment in patients-csv.util.ts: a row with no mapped documentId gets
// one generated automatically instead of blocking the import.
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
// then actually import (importPatientsAction). A file from another system
// — the legacy OTOLARYN desktop app's own NUMHISTORIA as this app's
// Documento, say — won't match the suggested mapping at all, which is
// exactly why this step exists instead of importing on a silent guess.
//
// Doesn't auto-close on a successful import like the other dialogs
// (CreatePatientDialog etc.) — a partial import (some rows skipped) is the
// expected common case here, not an error, and the user needs to actually
// read which rows and why before dismissing it themselves.
export function ImportPatientsDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(importPatientsAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  // Bumped on close to remount FileDropzone fresh — form.reset() clears the
  // underlying <input>, but not the dropzone's own "selected file" label.
  const [dropzoneKey, setDropzoneKey] = useState(0);

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [mapping, setMapping] = useState<ColumnMapping>({});

  function reset() {
    formRef.current?.reset();
    setDropzoneKey((k) => k + 1);
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(false);
    setMapping({});
  }

  async function handleFileSelected(file: File) {
    setPreview(null);
    setPreviewError(null);
    setMapping({});
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <UploadIcon data-icon="inline-start" />
          Importar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar pacientes</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={formAction} className="grid gap-4">
          <div className="space-y-2">
            <Label>Fichero</Label>
            <FileDropzone
              key={dropzoneKey}
              name="file"
              accept={ACCEPT}
              disabled={pending || previewLoading}
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
            <>
              <ImportColumnMapping
                preview={preview}
                mapping={mapping}
                onChange={setMapping}
                disabled={pending}
              />
              {/* The form action reads this, not React state — see importPatientsAction. */}
              <input type="hidden" name="mapping" value={JSON.stringify(mapping)} />
            </>
          )}

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          {state.result && (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <p>
                <span className="font-medium">{state.result.created}</span> de{" "}
                {state.result.totalRows} pacientes importados.
              </p>
              {state.result.skipped.length > 0 && (
                <div className="space-y-1">
                  <p className="font-medium text-destructive">
                    {state.result.skipped.length} fila{state.result.skipped.length === 1 ? "" : "s"}{" "}
                    omitida{state.result.skipped.length === 1 ? "" : "s"}:
                  </p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {state.result.skipped.map((s) => (
                      <li key={s.row}>
                        Fila {s.row}: {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {preview && (
            <Button
              type="submit"
              disabled={pending || !isMappingComplete(mapping)}
              className="w-fit"
            >
              {pending ? (
                "Importando..."
              ) : (
                <>
                  <UploadIcon data-icon="inline-start" />
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
