import { cn } from "@/lib/utils";

interface RichTextContentProps {
  html: string | null;
  emptyText?: string;
  className?: string;
}

// Read-only render of HTML the backend already sanitized on the way in
// (see rich-text.util.ts) — safe to render directly. Never used for
// anything a viewer authored themselves; always the same allowed-tags
// content RichTextEditor produced.
export function RichTextContent({ html, emptyText, className }: RichTextContentProps) {
  if (!html) {
    return emptyText ? <p className={cn("text-sm text-muted-foreground", className)}>{emptyText}</p> : null;
  }
  return (
    <div
      className={cn("rich-text-content text-sm", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
