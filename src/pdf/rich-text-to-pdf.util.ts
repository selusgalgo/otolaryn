import { ElementType } from 'domelementtype';
import type { ChildNode } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import type { Content, ContentText } from 'pdfmake/interfaces';

// Converts the narrow, sanitized rich-text HTML this app stores (Motivo,
// Exploración, Tratamiento, patient Notas — see
// src/shared/rich-text.util.ts's ALLOWED_TAGS: p, strong, em, h1-h3, ul,
// ol, li, br, blockquote, nothing else, no attributes at all) into a
// pdfmake content tree. Deliberately a small hand-written mapper rather
// than a general HTML-to-PDF renderer: the input is already constrained to
// exactly these tags by sanitizeRichText before it's ever saved, so there's
// no attacker-controlled markup (no href/src of any kind) to worry about,
// and no need for a layout engine that understands arbitrary CSS.

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
}

// Inline content for p/h1-3/li/blockquote — also transparently unwraps a
// <p> found inside a <li> (Tiptap's own listItem > paragraph > text shape),
// since a list row renders as one line of text here, not a nested block.
function collectInline(nodes: ChildNode[], style: InlineStyle): ContentText[] {
  const out: ContentText[] = [];
  for (const node of nodes) {
    if (node.type === ElementType.Text) {
      if (node.data) out.push({ text: node.data, ...style });
    } else if (node.type === ElementType.Tag) {
      if (node.name === 'strong') {
        out.push(...collectInline(node.children, { ...style, bold: true }));
      } else if (node.name === 'em') {
        out.push(...collectInline(node.children, { ...style, italics: true }));
      } else if (node.name === 'br') {
        out.push({ text: '\n' });
      } else if (node.name === 'p') {
        out.push(...collectInline(node.children, style));
      }
    }
  }
  return out;
}

// Only one level of <li> nesting is handled (no nested <ul>/<ol> inside a
// list item) — Tiptap's StarterKit list extensions used here don't produce
// that shape, so there's nothing to map in practice.
function mapListItems(nodes: ChildNode[]): Content[] {
  return nodes
    .filter(
      (n): n is typeof n & { children: ChildNode[] } =>
        n.type === ElementType.Tag && n.name === 'li',
    )
    .map((li) => ({ text: collectInline(li.children, {}) }));
}

function mapBlocks(nodes: ChildNode[]): Content[] {
  const out: Content[] = [];
  for (const node of nodes) {
    if (node.type !== ElementType.Tag) continue;
    switch (node.name) {
      case 'p':
        out.push({
          text: collectInline(node.children, {}),
          margin: [0, 0, 0, 4],
        });
        break;
      case 'h1':
        out.push({
          text: collectInline(node.children, {}),
          fontSize: 15,
          bold: true,
          margin: [0, 6, 0, 4],
        });
        break;
      case 'h2':
        out.push({
          text: collectInline(node.children, {}),
          fontSize: 13,
          bold: true,
          margin: [0, 5, 0, 3],
        });
        break;
      case 'h3':
        out.push({
          text: collectInline(node.children, {}),
          fontSize: 11,
          bold: true,
          margin: [0, 4, 0, 2],
        });
        break;
      case 'ul':
        out.push({ ul: mapListItems(node.children), margin: [0, 0, 0, 4] });
        break;
      case 'ol':
        out.push({ ol: mapListItems(node.children), margin: [0, 0, 0, 4] });
        break;
      case 'blockquote':
        out.push({
          stack: mapBlocks(node.children),
          italics: true,
          margin: [10, 2, 0, 4],
        });
        break;
      default:
        // Defensive only — sanitizeRichText's allowlist means this never
        // actually fires, but falls back to the tag's own inline text
        // rather than silently dropping content if it ever did.
        out.push({ text: collectInline(node.children, {}) });
    }
  }
  return out;
}

// null/empty -> [] (an empty array is a valid, no-op pdfmake Content[]),
// so callers can always splice this straight into their own content array
// without an extra "is there anything here" check.
export function richTextToPdfContent(
  html: string | null | undefined,
): Content[] {
  if (!html) return [];
  return mapBlocks(parseDocument(html).children);
}
