"use client";

import type { Editor } from "@tiptap/react";
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Los niveles h1-h3 son lo que guarda el HTML (y lo que entienden el backend y
// el PDF), pero "H1/H2/H3" no le dice nada a quien escribe una consulta. Aquí
// se muestran con nombres de uso cotidiano y, en el menú, con su tamaño real.
// Los tamaños son los de .rich-text-content en globals.css (21, 18 y 16 px).
const HEADING_OPTIONS = [
  { level: 1, label: "Título", className: "text-[1.3125rem] font-semibold leading-tight" },
  { level: 2, label: "Subtítulo", className: "text-[1.125rem] font-semibold leading-tight" },
  { level: 3, label: "Apartado", className: "text-base font-semibold leading-tight" },
] as const;

// Solo lo que se usa del editor de Tiptap: así el menú se puede probar con un
// editor de mentira sin montar Tiptap entero.
export type HeadingEditor = Pick<Editor, "isActive" | "chain">;

export function HeadingMenu({ editor, disabled }: { editor: HeadingEditor | null; disabled?: boolean }) {
  const activeLevel = HEADING_OPTIONS.find((o) => editor?.isActive("heading", { level: o.level }))?.level;
  const hasHeading = activeLevel !== undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled || !editor}
          aria-label="Encabezados"
          title="Encabezados"
          className={cn(
            "flex h-7 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50",
            hasHeading && "bg-accent text-accent-foreground",
          )}
        >
          Encabezados
          <ChevronDownIcon className="size-3.5" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      {/* Al cerrarse, Radix devuelve el foco al botón; se lo damos al editor
          para que se pueda seguir escribiendo sin otro clic (la selección se
          conserva dentro de ProseMirror aunque pierda el foco). */}
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          editor?.chain().focus().run();
        }}
      >
        <DropdownMenuItem
          aria-current={!hasHeading ? "true" : undefined}
          onSelect={() => editor?.chain().focus().setParagraph().run()}
        >
          <span className="flex-1 text-sm">Texto normal</span>
          {!hasHeading && <CheckIcon aria-hidden />}
        </DropdownMenuItem>
        {HEADING_OPTIONS.map(({ level, label, className }) => (
          <DropdownMenuItem
            key={level}
            aria-current={activeLevel === level ? "true" : undefined}
            onSelect={() => editor?.chain().focus().toggleHeading({ level }).run()}
          >
            <span className={cn("flex-1", className)}>{label}</span>
            {activeLevel === level && <CheckIcon aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
