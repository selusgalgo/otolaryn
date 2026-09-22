import sanitizeHtml from 'sanitize-html';

// Every long-text field the UI now edits with a rich-text (Tiptap)
// editor — patient Notas, and a consulta's Motivo/Exploración/Tratamiento
// — is sanitized through this exact allowlist before it's ever saved.
// Deliberately narrow: no links, images, or attributes of any kind — just
// the handful of tags Tiptap's StarterKit basic marks/blocks can produce
// (bold/italic, headings, lists, paragraphs). Nothing in this allowlist
// can carry a URI (href/src/action/...), which is what the known
// sanitize-html CVEs (javascript: URIs, SVG SMIL, textarea-solidus
// mutation-XSS) all depend on — none of the vulnerable tags/attributes
// are ever permitted through, regardless of the library version's own
// patch status.
const ALLOWED_TAGS = [
  'p',
  'strong',
  'em',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'br',
  'blockquote',
];

// For plain text that never went through the rich-text editor (a legacy
// import row) — a bare newline does nothing once rendered as HTML, so it
// has to become a real <br> here or multi-line legacy text (a common
// shape for Motivo/Exploración) collapses onto one line. sanitizeRichText
// still runs over the result: this is the one path where the input is a
// plain string, not already-editor-produced HTML, so it needs escaping
// for any literal "<"/">" the source text happens to contain.
export function plainTextToRichText(text: string): string {
  const withBreaks = text
    .split(/\r\n|\r|\n/)
    .map((line) =>
      sanitizeHtml(line, { allowedTags: [], allowedAttributes: {} }),
    )
    .join('<br>');
  return sanitizeRichText(withBreaks);
}

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
    // Collapses <p></p> etc. left behind by an editor's own empty-line
    // handling into nothing, rather than persisting invisible clutter.
    exclusiveFilter: (frame) =>
      ['p', 'li'].includes(frame.tag) &&
      !frame.text.trim() &&
      !frame.mediaChildren.length,
  }).trim();
}
