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

// web/public/logo.svg rendered to PNG once (its "Mederi" lettering is live
// text in Bw Gradual, a font the server doesn't have, so the SVG itself
// can't be drawn faithfully here). Read lazily and cached; passed to
// pdfmake as a data: URI, which bypasses PdfService's local-file policy.
export function mederiLogoDataUri(): string {
  if (!logoDataUri) {
    const png = readFileSync(join(__dirname, 'assets', 'mederi-logo.png'));
    logoDataUri = `data:image/png;base64,${png.toString('base64')}`;
  }
  return logoDataUri;
}
