"use client";

import { useRef, useState } from "react";
import { FileIcon, UploadIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  name: string;
  accept?: string;
  disabled?: boolean;
  hint?: string;
  // Fired whenever a file is dropped or picked — lets a parent that needs
  // the actual File object (e.g. to kick off an upload-and-preview call)
  // get it without reaching into this component's own DOM/state.
  onFileSelected?: (file: File) => void;
}

// A styled drag-and-drop area over a real (visually hidden, not display:none
// — that would drop it from the tab order) <input type="file">, so the
// surrounding <form>'s native submission still picks it up under `name`
// exactly like a plain file input would; nothing here is wired to
// useActionState or a Server Action directly. Dropped/browsed files are
// pushed into the input via a synthetic DataTransfer, the same trick the
// browser itself uses internally — assigning a FileList literal isn't
// possible any other way.
export function FileDropzone({ name, accept, disabled, hint, onFileSelected }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  function acceptFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setFileName(file.name);
    if (inputRef.current) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      inputRef.current.files = transfer.files;
    }
    onFileSelected?.(file);
  }

  return (
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
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        if (!disabled) acceptFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors outline-none",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        dragActive ? "border-primary bg-primary/5" : "border-input hover:bg-muted/50",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {fileName ? (
        <>
          <FileIcon className="size-5 text-muted-foreground" />
          <p className="font-medium">{fileName}</p>
          <p className="text-xs text-muted-foreground">Haz clic o suelta otro fichero para cambiarlo</p>
        </>
      ) : (
        <>
          <UploadIcon className="size-5 text-muted-foreground" />
          <p>
            Arrastra un fichero aquí o <span className="font-medium text-foreground">haz clic para seleccionarlo</span>
          </p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        disabled={disabled}
        required
        onChange={(e) => acceptFiles(e.target.files)}
        className="sr-only"
      />
    </div>
  );
}
