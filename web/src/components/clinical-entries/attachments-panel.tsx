"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentTextIcon, PaperClipIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  deleteAttachmentAction,
  listAttachmentsAction,
  uploadAttachmentAction,
} from "@/lib/actions/clinical-entry-attachments";
import {
  ACCEPTED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_ENTRY,
  formatFileSize,
  isImageMime,
  prepareAttachment,
} from "@/lib/attachments";
import type { ClinicalEntryAttachment } from "@/lib/types";

interface AttachmentsPanelProps {
  patientId: string;
  // Consulta (o borrador) a la que pertenecen. null en un alta que aún no tiene
  // borrador: se crea en el momento de subir el primer archivo con `ensureEntryId`.
  entryId: string | null;
  ensureEntryId?: () => Promise<string | null>;
  // Quien puede añadir y quitar archivos; el resto solo los ve.
  canManage: boolean;
}

// Archivos (PDF e imágenes) adjuntos a una consulta. Las fotos se reducen en el
// navegador antes de subirlas, como hace WhatsApp, para que no pesen en el servidor.
export function AttachmentsPanel({ patientId, entryId, ensureEntryId, canManage }: AttachmentsPanelProps) {
  const [currentId, setCurrentId] = useState(entryId);
  const [items, setItems] = useState<ClinicalEntryAttachment[]>([]);
  const [loading, setLoading] = useState(Boolean(entryId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (id: string) => {
    const res = await listAttachmentsAction(id);
    if (res.attachments) setItems(res.attachments);
    else setError(res.error ?? "No se pudieron cargar los archivos.");
    setLoading(false);
  }, []);

  useEffect(() => {
    if (entryId) {
      setCurrentId(entryId);
      void load(entryId);
    }
  }, [entryId, load]);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      let id = currentId;
      let count = items.length;
      for (const original of Array.from(files)) {
        if (count >= MAX_ATTACHMENTS_PER_ENTRY) {
          setError(`Máximo ${MAX_ATTACHMENTS_PER_ENTRY} archivos por consulta.`);
          break;
        }
        const file = await prepareAttachment(original);
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setError(`«${original.name}» pesa más de 10 MB.`);
          continue;
        }
        if (!id) {
          id = (await ensureEntryId?.()) ?? null;
          if (!id) {
            setError("No se pudo guardar el borrador para adjuntar el archivo.");
            break;
          }
          setCurrentId(id);
        }
        const form = new FormData();
        form.set("file", file, file.name);
        const res = await uploadAttachmentAction(patientId, id, form);
        if (res.attachment) {
          const added = res.attachment;
          setItems((prev) => [...prev, added]);
          count += 1;
        } else {
          setError(res.error ?? "No se pudo subir el archivo.");
        }
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onDelete(item: ClinicalEntryAttachment) {
    if (!currentId || !window.confirm(`¿Quitar «${item.originalName}» de la consulta?`)) return;
    setError(null);
    setBusy(true);
    const res = await deleteAttachmentAction(patientId, currentId, item.id);
    setBusy(false);
    if (res.error) setError(res.error);
    else setItems((prev) => prev.filter((a) => a.id !== item.id));
  }

  const url = (a: ClinicalEntryAttachment, download = false) =>
    `/patients/${patientId}/clinical-entries/${a.clinicalEntryId}/attachments/${a.id}${download ? "?download=1" : ""}`;

  if (!canManage && !loading && items.length === 0 && !error) return null;

  return (
    <div className="space-y-2" aria-busy={busy || loading}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <PaperClipIcon className="size-4" aria-hidden />
          Archivos adjuntos
          {items.length > 0 && <span className="text-muted-foreground">({items.length})</span>}
        </h3>
        {canManage && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED_ATTACHMENT_TYPES}
              className="hidden"
              onChange={(e) => void onFiles(e.target.files)}
              data-testid="attachment-input"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || items.length >= MAX_ATTACHMENTS_PER_ENTRY}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? "Subiendo..." : "Adjuntar archivo"}
            </Button>
          </>
        )}
      </div>
      {canManage && (
        <p className="text-xs text-muted-foreground">
          PDF o imágenes (JPG, PNG, WebP), hasta 10 MB y {MAX_ATTACHMENTS_PER_ENTRY} archivos por consulta. Las
          fotos se reducen automáticamente antes de subirlas.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {items.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-lg border border-input p-2">
              <a
                href={url(a)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded bg-muted"
                aria-label={`Abrir ${a.originalName}`}
              >
                {isImageMime(a.mimeType) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url(a)} alt="" className="size-full object-cover" loading="lazy" />
                ) : (
                  <DocumentTextIcon className="size-6 text-muted-foreground" aria-hidden />
                )}
              </a>
              <div className="min-w-0 flex-1">
                <a
                  href={url(a)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-medium hover:underline"
                  title={a.originalName}
                >
                  {a.originalName}
                </a>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span>{formatFileSize(a.sizeBytes)}</span>
                  <a href={url(a, true)} className="hover:underline">
                    Descargar
                  </a>
                </div>
              </div>
              {canManage && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void onDelete(a)}
                  aria-label={`Quitar ${a.originalName}`}
                >
                  <TrashIcon className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
