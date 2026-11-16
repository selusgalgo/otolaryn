"use client";

import { useRef, useState } from "react";
import { ArrowUpTrayIcon, DocumentIcon } from "@heroicons/react/24/outline";
import { matchesAccept } from "@/lib/file-accept";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  // Field name when the surrounding <form> submits the file natively. Omit it
  // for an upload that is handled entirely through the callbacks.
  name?: string;
  id?: string;
  accept?: string;
  disabled?: boolean;
  // A file is mandatory by default (the import wizards need one); pass false
  // for an optional upload such as the clinic logo.
  required?: boolean;
  multiple?: boolean;
  hint?: string;
  // What the prompt calls the thing being uploaded: "un fichero" by default,
  // "el logotipo", "el PDF firmado"… (with `multiple`, plural: "archivos").
  fileLabel?: string;
  // Replaces the prompt while something is happening (e.g. "Subiendo...").
  statusLabel?: string;
  compact?: boolean;
  // For uploads that start the moment files are chosen (attachments): the
  // input is emptied after each selection so picking the same file again
  // still fires, and no file name is kept on screen.
  clearAfterSelect?: boolean;
  inputTestId?: string;
  // Fired whenever a file is dropped or picked — lets a parent that needs
  // the actual File object (e.g. to kick off an upload-and-preview call)
  // get it without reaching into this component's own DOM/state.
  onFileSelected?: (file: File) => void;
  onFilesSelected?: (files: File[]) => void;
}

// A styled drag-and-drop area over a real (visually hidden, not display:none
// — that would drop it from the tab order) <input type="file">, so the
// surrounding <form>'s native submission still picks it up under `name`
// exactly like a plain file input would; nothing here is wired to
// useActionState or a Server Action directly. Dropped files are pushed into
// the input via a synthetic DataTransfer — assigning a FileList literal isn't
// possible any other way; picked files are already in it.
//
// Dropped files skip the browser's own `accept` filtering, so they're checked
// here (matchesAccept) and refused with a message instead of reaching the
// server as the wrong kind of file.
export function FileDropzone({
  name,
  id,
  accept,
  disabled,
  required = true,
  multiple = false,
  hint,
  fileLabel,
  statusLabel,
  compact = false,
  clearAfterSelect = false,
  inputTestId,
  onFileSelected,
  onFilesSelected,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noun = fileLabel ?? (multiple ? "archivos" : "un fichero");

  function acceptFiles(incoming: File[], viaDrop: boolean) {
    if (incoming.length === 0) return;
    const valid = incoming.filter((file) => matchesAccept(file, accept));
    if (valid.length === 0) {
      setError("Este formato no está admitido.");
      return;
    }
    setError(
      valid.length < incoming.length
        ? `${incoming.length - valid.length} archivo(s) no se han añadido: formato no admitido.`
        : null,
    );
    const chosen = multiple ? valid : valid.slice(0, 1);

    if (!clearAfterSelect) {
      setFileNames(chosen.map((file) => file.name));
      if (viaDrop && inputRef.current) {
        const transfer = new DataTransfer();
        for (const file of chosen) transfer.items.add(file);
        inputRef.current.files = transfer.files;
      }
    }
    onFileSelected?.(chosen[0]);
    onFilesSelected?.(chosen);
    if (clearAfterSelect && inputRef.current) inputRef.current.value = "";
  }

  const hasFiles = fileNames.length > 0;

  return (
    <div className="space-y-1.5">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        // dragleave also fires when the pointer moves onto a child element;
        // only a real exit from the area should switch the highlight off.
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragActive(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (!disabled) acceptFiles(Array.from(e.dataTransfer.files), true);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed text-center text-sm transition-colors outline-none",
          compact ? "p-3" : "p-6",
          "focus-visible:ring-3 focus-visible:ring-ring/50",
          dragActive ? "border-primary bg-primary/5" : "border-input hover:bg-muted/50",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        {statusLabel ? (
          <p className="font-medium">{statusLabel}</p>
        ) : hasFiles ? (
          <>
            <DocumentIcon className="size-5 text-muted-foreground" />
            <p className="font-medium">
              {fileNames[0]}
              {fileNames.length > 1 && <span className="text-muted-foreground"> y {fileNames.length - 1} más</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {multiple ? "Haz clic o suelta otros archivos para cambiarlos" : "Haz clic o suelta otro fichero para cambiarlo"}
            </p>
          </>
        ) : (
          <>
            <ArrowUpTrayIcon className="size-5 text-muted-foreground" />
            <p>
              Arrastra {noun} aquí o{" "}
              <span className="font-medium text-foreground">haz clic para seleccionarlo{multiple ? "s" : ""}</span>
            </p>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </>
        )}
        <input
          ref={inputRef}
          id={id}
          type="file"
          name={name}
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          required={required && !clearAfterSelect}
          onChange={(e) => acceptFiles(Array.from(e.target.files ?? []), false)}
          className="sr-only"
          data-testid={inputTestId}
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
