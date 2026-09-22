"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bars3BottomLeftIcon,
  ListBulletIcon,
  NumberedListIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

// Matches the backend's own allowlist exactly (see rich-text.util.ts) —
// disabling everything StarterKit offers beyond bold/italic/headings/
// lists/blockquote here means what the toolbar can produce and what the
// server accepts never drift apart.
function useRichTextEditor(
  value: string,
  onChange: (html: string) => void,
  disabled?: boolean,
  placeholder?: string,
) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        strike: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      attributes: {
        class: "rich-text-content min-h-24 px-3 py-2 text-sm outline-none",
      },
    },
  });

  // Keeps the editor in sync when `value` changes from outside (e.g. a
  // Cancelar that resets to the saved value) without fighting the
  // editor's own state on every keystroke — only resets when the two
  // have actually diverged.
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  return editor;
}

function ToolbarButton({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50",
        active && "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

// A minimal Tiptap editor limited to exactly the formatting the backend
// keeps (see rich-text.util.ts): bold, italic, headings 1-3, bullet/
// numbered lists, blockquote. `value`/`onChange` carry plain HTML — the
// caller is responsible for putting that HTML into the form (a hidden
// input), since Tiptap has no native form field of its own.
export function RichTextEditor({ value, onChange, disabled, placeholder }: RichTextEditorProps) {
  const editor = useRichTextEditor(value, onChange, disabled, placeholder);

  return (
    <div
      className={cn(
        "rounded-lg border border-input bg-background",
        disabled && "opacity-50",
      )}
    >
      <div className="flex items-center gap-0.5 border-b border-input p-1">
        <ToolbarButton
          label="Negrita"
          active={!!editor?.isActive("bold")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          label="Cursiva"
          active={!!editor?.isActive("italic")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          label="Encabezado 1"
          active={!!editor?.isActive("heading", { level: 1 })}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          label="Encabezado 2"
          active={!!editor?.isActive("heading", { level: 2 })}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          label="Encabezado 3"
          active={!!editor?.isActive("heading", { level: 3 })}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          label="Lista con viñetas"
          active={!!editor?.isActive("bulletList")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <ListBulletIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Lista numerada"
          active={!!editor?.isActive("orderedList")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <NumberedListIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Cita"
          active={!!editor?.isActive("blockquote")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Bars3BottomLeftIcon className="size-4" />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
