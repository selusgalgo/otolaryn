"use client";

import { useState, useTransition } from "react";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { FileDropzone } from "@/components/patients/file-dropzone";
import { ImportClinicalEntriesColumnMapping } from "@/components/clinical-entries/import-clinical-entries-column-mapping";
import { ImportClinicalEntriesDoctorMapping } from "@/components/clinical-entries/import-clinical-entries-doctor-mapping";
import {
  getDistinctDoctorsAction,
  importClinicalEntriesAction,
  previewClinicalEntriesImportAction,
} from "@/lib/actions/clinical-entries-import";
import type {
  ClinicalEntriesImportPreview,
  ClinicalEntryColumnMapping,
  ImportClinicalEntriesResult,
} from "@/lib/actions/clinical-entries-import";
import type { PractitionerOption } from "@/lib/practitioners";

const ACCEPT =
  ".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface ImportClinicalEntriesDialogProps {
  practitioners?: PractitionerOption[] | null;
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
export function ImportClinicalEntriesDialog({ practitioners }: ImportClinicalEntriesDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [pending, startTransition] = useTransition();
  const [dropzoneKey, setDropzoneKey] = useState(0);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ClinicalEntriesImportPreview | null>(null);
  const [mapping, setMapping] = useState<ClinicalEntryColumnMapping>({});
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [doctorNames, setDoctorNames] = useState<string[]>([]);
  const [doctorMapping, setDoctorMapping] = useState<Record<string, string | undefined>>({});

  const [result, setResult] = useState<ImportClinicalEntriesResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("upload");
    setDropzoneKey((k) => k + 1);
    setFile(null);
    setPreview(null);
    setMapping({});
    setPreviewError(null);
    setDoctorNames([]);
    setDoctorMapping({});
    setResult(null);
    setError(null);
  }

  function handleFileSelected(selected: File) {
    setFile(selected);
    setPreview(null);
    setMapping({});
    setPreviewError(null);
    setResult(null);
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

  function runImport(finalDoctorMapping: Record<string, string | undefined>) {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const cleaned: Record<string, string> = {};
      for (const [name, userId] of Object.entries(finalDoctorMapping)) {
        if (userId) cleaned[name] = userId;
      }
      const state = await importClinicalEntriesAction(file, mapping, cleaned);
      if (state.error) {
        setError(state.error);
        return;
      }
      if (state.result) {
        setResult(state.result);
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
      <DialogTrigger asChild>
        <Button variant="outline">
          <UploadIcon data-icon="inline-start" />
          Importar consultas
        </Button>
      </DialogTrigger>
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

          {result && (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <p>
                <span className="font-medium">{result.created}</span> de {result.totalRows}{" "}
                consultas importadas.
              </p>
              {result.skipped.length > 0 && (
                <div className="space-y-1">
                  <p className="font-medium text-destructive">
                    {result.skipped.length} fila{result.skipped.length === 1 ? "" : "s"} omitida
                    {result.skipped.length === 1 ? "" : "s"}:
                  </p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {result.skipped.map((s) => (
                      <li key={s.row}>
                        Fila {s.row}: {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {preview && !result && step === "mapping" && (
            <Button type="button" onClick={goToDoctors} disabled={pending} className="w-fit">
              {pending ? "Comprobando..." : "Siguiente"}
            </Button>
          )}
          {step === "doctors" && !result && (
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
                    <UploadIcon data-icon="inline-start" />
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
