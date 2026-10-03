import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { ClinicalEntry } from '../clinical-entries/entities/clinical-entry.entity';
import type { Patient } from '../patients/entities/patient.entity';
import { richTextToPdfContent } from './rich-text-to-pdf.util';

export interface TreatmentPdfData {
  patient: Patient;
  entry: ClinicalEntry;
}

// visitDate is `timestamptz` — see the longer comment in
// patient-record-pdf.util.ts for why this needs an explicit timezone
// rather than the server's own local one.
const CLINIC_TIME_ZONE = 'Europe/Madrid';

function formatClinicDate(value: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: CLINIC_TIME_ZONE,
  }).format(value);
}

const MM_PER_PT = 1 / 2.83465;
function mmToPt(mm: number): number {
  return mm / MM_PER_PT;
}

// Left, top, right, bottom — top stays a full 2cm even with no header/logo
// printed on this document (see below), so the layout still reads as
// deliberately framed rather than text crammed into a corner.
const PAGE_MARGINS: [number, number, number, number] = [
  mmToPt(10), // 1cm
  mmToPt(20), // 2cm
  mmToPt(10), // 1cm
  mmToPt(15), // 1.5cm
];

// A small handout slip, not the clinic's own letterhead: printed on A5
// landscape so it folds/fits differently from the full A4 ficha, no logo or
// clinic name/address — just who it's for, the treatment itself, and the
// date at the bottom.
export function buildTreatmentPdf(
  data: TreatmentPdfData,
): TDocumentDefinitions {
  const { patient, entry } = data;

  return {
    pageSize: 'A5',
    pageOrientation: 'landscape',
    pageMargins: PAGE_MARGINS,
    info: {
      title: `Tratamiento — ${patient.firstName} ${patient.lastName}`,
    },
    // Overrides PdfService's own default footer (just today's export date)
    // with the consulta's own date instead — the date that actually matters
    // on a slip handed to the patient is when the treatment was prescribed,
    // not when this particular copy was printed.
    footer: {
      text: formatClinicDate(entry.visitDate),
      fontSize: 8,
      color: '#999999',
      margin: [PAGE_MARGINS[0], 0, PAGE_MARGINS[2], 14],
    },
    content: [
      {
        text: [
          { text: 'Paciente: ', bold: true },
          `${patient.firstName} ${patient.lastName}`,
        ],
        fontSize: 11,
        margin: [0, 0, 0, 12],
      },
      entry.treatment
        ? richTextToPdfContent(entry.treatment)
        : {
            text: 'Sin tratamiento indicado en esta consulta.',
            fontSize: 10,
            italics: true,
          },
    ],
  };
}
