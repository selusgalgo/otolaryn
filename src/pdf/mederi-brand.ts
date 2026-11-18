import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Mederi's own identity, for the documents Mederi itself issues (SEPA
// mandate) — not the clinic letterhead (clinic-header.util.ts), which
// carries each clinic's own logo and colours.

// Same values as the web app's --primary / --primary-tint / --accent
// (web/src/app/globals.css).
export const MEDERI_COLORS = {
  primary: '#0022B0',
  // color-mix(primary 8%, white)
  tint: '#EBEDF9',
  accent: '#A7D5F2',
  text: '#1F2433',
  muted: '#5B6275',
  border: '#D3D8EE',
};

let logoDataUri: string | null = null;

// The horizontal logo (symbol + "Mederi", ~3:1) in brand blue — the same
// drawing as web/public/logo-horizontal.svg, rendered to PNG once because
// pdfmake can't draw SVG. Read lazily and cached; passed to pdfmake as a
// data: URI, which bypasses PdfService's local-file policy.
export function mederiLogoDataUri(): string {
  if (!logoDataUri) {
    const png = readFileSync(
      join(__dirname, 'assets', 'mederi-logo-horizontal.png'),
    );
    logoDataUri = `data:image/png;base64,${png.toString('base64')}`;
  }
  return logoDataUri;
}
