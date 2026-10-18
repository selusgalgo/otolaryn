import { richTextToPdfContent } from './rich-text-to-pdf.util';
import type { ContentText } from 'pdfmake/interfaces';

// Pulls every { text } string out of a pdfmake Content[] tree, regardless
// of nesting (p/h1-3 text arrays, ul/ol items, blockquote stacks) — these
// tests only care that the real text made it in somewhere, not the exact
// shape pdfmake expects it in.
function flattenText(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(flattenText).join('');
  if (typeof content === 'object') {
    const obj = content as { text?: unknown; stack?: unknown; ul?: unknown; ol?: unknown };
    return [
      flattenText(obj.text),
      flattenText(obj.stack),
      flattenText(obj.ul),
      flattenText(obj.ol),
    ].join('');
  }
  return '';
}

describe('richTextToPdfContent', () => {
  it('returns an empty array for null/empty input', () => {
    expect(richTextToPdfContent(null)).toEqual([]);
    expect(richTextToPdfContent(undefined)).toEqual([]);
    expect(richTextToPdfContent('')).toEqual([]);
  });

  it('renders a normal Tiptap-authored <p> paragraph', () => {
    const content = richTextToPdfContent('<p>Dolor de oído desde hace 3 días.</p>');
    expect(flattenText(content)).toContain('Dolor de oído desde hace 3 días.');
  });

  // The actual bug: plainTextToRichText (used by the Pacientes/Consultas
  // bulk importers) joins lines with <br> and never wraps the result in a
  // <p> — valid HTML a browser renders fine, but the PDF mapper used to
  // only look at top-level block tags, so this produced an empty PDF.
  it('renders legacy-imported content: bare text joined by <br>, no <p> wrapper', () => {
    const legacy = 'MOTIVO CONSULTA<br>Revisión de oído derecho<br>Sin antecedentes';
    const content = richTextToPdfContent(legacy);
    const text = flattenText(content);
    expect(text).toContain('MOTIVO CONSULTA');
    expect(text).toContain('Revisión de oído derecho');
    expect(text).toContain('Sin antecedentes');
  });

  it('renders a mix of a real <p> block and trailing bare legacy text', () => {
    const mixed = '<p>Nota añadida en la app.</p>Texto suelto importado<br>del histórico';
    const content = richTextToPdfContent(mixed);
    const text = flattenText(content);
    expect(text).toContain('Nota añadida en la app.');
    expect(text).toContain('Texto suelto importado');
    expect(text).toContain('del histórico');
  });

  it('still renders lists and headings as before', () => {
    const content = richTextToPdfContent(
      '<h2>Antecedentes</h2><ul><li>Tabaco</li><li>Alcohol</li></ul>',
    );
    const text = flattenText(content);
    expect(text).toContain('Antecedentes');
    expect(text).toContain('Tabaco');
    expect(text).toContain('Alcohol');
  });

  it('preserves bold/italic formatting on real inline text', () => {
    const content = richTextToPdfContent('<p><strong>Importante:</strong> revisar en 2 semanas.</p>');
    const inline = (content[0] as { text: ContentText[] }).text;
    const bold = inline.find((t) => t.text === 'Importante:');
    expect(bold?.bold).toBe(true);
  });
});
