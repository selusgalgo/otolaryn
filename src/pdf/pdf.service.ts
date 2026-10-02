import { Injectable } from '@nestjs/common';
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

function ensurePdfMakeConfigured(): void {
  if (fontsRegistered) return;
  pdfMake.addFonts(HELVETICA_FONTS);
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
      ...docDefinition,
    });
    return pdf.getBuffer();
  }
}
