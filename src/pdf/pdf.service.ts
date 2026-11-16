import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pdfMake from 'pdfmake';
import type { TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';

// Standard14 PDF fonts (built into every PDF reader, no font files to ship
// or embed) — these string names are exactly what pdfkit (pdfmake's
// underlying renderer) recognises natively. Good enough here: every PDF
// this app generates is plain business-document text (no custom branding
// typeface requested), and shipping a real font file is unnecessary
// complexity this doesn't need yet.
const HELVETICA_FONTS: TFontDictionary = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

let fontsRegistered = false;

// The exact strings pdfkit resolves as its built-in Standard14 fonts (not
// real filesystem paths) — kept as its own literal list rather than derived
// from HELVETICA_FONTS above, since TFontFamilyTypes' values are typed via
// the (uninstalled) PDFKit.Mixins.PDFFontSource and would otherwise collapse
// to `any`. Must stay in sync with HELVETICA_FONTS by hand.
const STANDARD_FONT_NAMES = new Set([
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
]);

// addFonts/setUrlAccessPolicy/setLocalAccessPolicy are process-global state
// on the pdfmake module, not per-instance — registering more than once is
// harmless (addFonts just re-sets the same entry) but there's no reason to
// repeat it on every request, so it's guarded once per process instead.

// Same clinic timezone every other PDF date in this app uses (see
// patient-record-pdf.util.ts's own CLINIC_TIME_ZONE comment) — this app is
// built for one clinic in Spain, so "today" always means the clinic's day,
// not whatever zone the Vercel function generating the PDF happens to run
// in (UTC, typically).
const CLINIC_TIME_ZONE = 'Europe/Madrid';

function defaultFooter(): TDocumentDefinitions['footer'] {
  // "3 de octubre de 2026", not a slashed d/m/y — the long form reads as a
  // deliberate "exported on" stamp rather than a data field.
  const exportedOn = new Intl.DateTimeFormat('es-ES', {
    timeZone: CLINIC_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
  return {
    text: exportedOn,
    fontSize: 8,
    color: '#999999',
    margin: [40, 0, 40, 20],
  };
}

// Inter — Mederi's own typeface, used by the branded documents (SEPA
// mandate), unlike the clinic-facing PDFs above, which stay on Helvetica.
// Shipped as static TTFs in pdf/assets/fonts (copied to dist by nest-cli's
// "assets" setting) and handed to pdfmake through its virtual file system,
// so the local-access policy below stays as strict as it is. SemiBold
// doubles as "bold": Inter Bold reads too heavy at document sizes.
export const INTER_FONT = 'Inter';
const INTER_FILES = {
  regular: 'Inter-Regular.ttf',
  semibold: 'Inter-SemiBold.ttf',
};
const logger = new Logger('PdfService');

// pdfmake's Node build exposes its virtual file system at runtime, but
// @types/pdfmake doesn't declare it.
const pdfVirtualFs = (
  pdfMake as unknown as {
    virtualfs: { writeFileSync(name: string, data: Buffer): void };
  }
).virtualfs;

function registerInter(): void {
  const dir = join(__dirname, 'assets', 'fonts');
  try {
    for (const file of Object.values(INTER_FILES)) {
      pdfVirtualFs.writeFileSync(file, readFileSync(join(dir, file)));
    }
  } catch (err) {
    // Only the documents that ask for Inter fail without it — patient
    // PDFs keep working, which matters more than a missing brand font.
    logger.error(`Inter font files missing in ${dir}: ${String(err)}`);
    return;
  }
  pdfMake.addFonts({
    [INTER_FONT]: {
      normal: INTER_FILES.regular,
      bold: INTER_FILES.semibold,
      italics: INTER_FILES.regular,
      bolditalics: INTER_FILES.semibold,
    },
  });
}

function ensurePdfMakeConfigured(): void {
  if (fontsRegistered) return;
  pdfMake.addFonts(HELVETICA_FONTS);
  registerInter();
  // Every docDefinition built in this app comes from our own content
  // builders, which never reference an image by URL or a font/image by
  // local path — denying everything except the Standard14 font names
  // above is pure hardening (defense in depth against a future
  // docDefinition doing something it shouldn't), not a workaround for
  // anything this app actually needs.
  pdfMake.setUrlAccessPolicy(() => false);
  pdfMake.setLocalAccessPolicy((path) => STANDARD_FONT_NAMES.has(path));
  fontsRegistered = true;
}

@Injectable()
export class PdfService {
  async render(docDefinition: TDocumentDefinitions): Promise<Buffer> {
    ensurePdfMakeConfigured();
    const pdf = pdfMake.createPdf({
      pageMargins: [40, 40, 40, 40],
      defaultStyle: { font: 'Helvetica', fontSize: 10 },
      footer: defaultFooter(),
      ...docDefinition,
    });
    return pdf.getBuffer();
  }
}
