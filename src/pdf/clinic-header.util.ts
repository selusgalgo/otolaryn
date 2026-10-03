import type { Content } from 'pdfmake/interfaces';

export interface ClinicProfileData {
  name: string;
  // Short subtitle under the name (e.g. "Otorrinolaringología — Cirugía de
  // cara y cuello").
  tagline: string | null;
  address: string | null;
  phone: string | null;
  // A data: URI (base64) or null — see Tenant.logo's own comment for why
  // this is never a file path/URL. pdfmake's `image` content accepts a
  // data: URI directly, so this never touches PdfService's
  // local/url access policies at all. Already cropped into a circle by
  // logoFileToDataUri (clinic-logo.util.ts) at upload time — nothing left
  // for this header to do but place it.
  logo: string | null;
}

// Page content width under pdf.service.ts's pageMargins: [40, 40, 40, 40]
// on A4 (595.28pt wide) — reused by the divider line below so it spans
// exactly as far as the rest of the content does.
const CONTENT_WIDTH = 515;

// Every line of the header's text (name, tagline, address, phone) in one
// consistent blue, rather than black name + grey details.
const HEADER_COLOR = '#1F4E79';

// 3cm (1cm = 28.3465pt) — a fixed logo box, set on the column itself (not
// just the image's own `fit`) so the text column next to it always gets the
// rest of the page width, however wide or narrow the actual logo image is.
const LOGO_SIZE_PT = 85;

function divider(): Content {
  return {
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: CONTENT_WIDTH,
        y2: 0,
        lineWidth: 0.5,
        lineColor: '#999999',
      },
    ],
    margin: [0, 4, 0, 12],
  };
}

// The letterhead every exported PDF (ficha de paciente, tratamiento) opens
// with — logo (if the clinic has configured one) beside name/tagline/
// address/phone, then a divider line, echoing the look of the legacy
// system's own printed fichas without trying to reproduce it pixel for
// pixel (centered text, underlines on every line) — this is plainer on
// purpose.
export function clinicHeader(clinic: ClinicProfileData): Content[] {
  // Smaller than before (was 16) now that there's a tagline line competing
  // for attention under it, and each paragraph gets a real top margin (was
  // 3pt) instead of sitting nearly flush against the one above.
  const textStack: Content[] = [
    { text: clinic.name, fontSize: 13, bold: true, color: HEADER_COLOR },
  ];
  if (clinic.tagline) {
    textStack.push({
      text: clinic.tagline,
      fontSize: 8,
      italics: true,
      color: HEADER_COLOR,
      margin: [0, 5, 0, 0],
    });
  }
  // Address and phone each get their own line now, phone below address —
  // previously joined on one line with a "·" separator.
  if (clinic.address) {
    textStack.push({
      text: clinic.address,
      fontSize: 9,
      color: HEADER_COLOR,
      margin: [0, 5, 0, 0],
    });
  }
  if (clinic.phone) {
    textStack.push({
      text: `Tel.: ${clinic.phone}`,
      fontSize: 9,
      color: HEADER_COLOR,
      margin: [0, 2, 0, 0],
    });
  }

  // The logo gets a fixed 3x3cm box (`width` on the column reserves that
  // space regardless of the image's own aspect ratio; `fit` inside it keeps
  // the image from stretching) — everything else goes to the name/address/
  // phone column, which is what should actually fill most of the header.
  const header: Content = clinic.logo
    ? {
        columns: [
          {
            image: clinic.logo,
            fit: [LOGO_SIZE_PT, LOGO_SIZE_PT],
            width: LOGO_SIZE_PT,
          },
          { stack: textStack, width: '*', margin: [14, 4, 0, 0] },
        ],
        columnGap: 0,
      }
    : { stack: textStack };

  return [header, divider()];
}
