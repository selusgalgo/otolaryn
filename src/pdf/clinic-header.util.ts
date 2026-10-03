import type { Content } from 'pdfmake/interfaces';

export interface ClinicProfileData {
  name: string;
  address: string | null;
  phone: string | null;
  // A data: URI (base64) or null — see Tenant.logo's own comment for why
  // this is never a file path/URL. pdfmake's `image` content accepts a
  // data: URI directly, so this never touches PdfService's
  // local/url access policies at all.
  logo: string | null;
}

// Page content width under pdf.service.ts's pageMargins: [40, 40, 40, 40]
// on A4 (595.28pt wide) — reused by the divider line below so it spans
// exactly as far as the rest of the content does.
const CONTENT_WIDTH = 515;

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
// with — logo (if the clinic has configured one) beside name/address/phone,
// then a divider line, echoing the look of the legacy system's own printed
// fichas without trying to reproduce it pixel for pixel (centered text,
// underlines on every line) — this is plainer on purpose, there being
// nothing in the data model for a specialties subtitle the legacy letterhead
// also had.
export function clinicHeader(clinic: ClinicProfileData): Content[] {
  const details = [
    clinic.address,
    clinic.phone ? `Tel.: ${clinic.phone}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  const textStack: Content[] = [
    { text: clinic.name, fontSize: 14, bold: true },
  ];
  if (details) {
    textStack.push({
      text: details,
      fontSize: 9,
      color: '#666666',
      margin: [0, 2, 0, 0],
    });
  }

  const header: Content = clinic.logo
    ? {
        columns: [
          { image: clinic.logo, fit: [48, 48] },
          { stack: textStack, margin: [10, 2, 0, 0] },
        ],
        columnGap: 0,
      }
    : { stack: textStack };

  return [header, divider()];
}
