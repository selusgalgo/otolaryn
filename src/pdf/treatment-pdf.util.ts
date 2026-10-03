import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { ClinicalEntry } from '../clinical-entries/entities/clinical-entry.entity';
import type { Patient } from '../patients/entities/patient.entity';
import { clinicHeader } from './clinic-header.util';
import type { ClinicProfileData } from './clinic-header.util';
import { richTextToPdfContent } from './rich-text-to-pdf.util';

export interface TreatmentPdfData {
  clinic: ClinicProfileData;
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

// A short, letter-style document meant to be printed and handed to the
// patient — just enough identification (clinic, patient, date) plus the
// treatment itself, not the full ficha.
export function buildTreatmentPdf(
  data: TreatmentPdfData,
): TDocumentDefinitions {
  const { clinic, patient, entry } = data;

  return {
    info: {
      title: `Tratamiento — ${patient.firstName} ${patient.lastName}`,
    },
    content: [
      ...clinicHeader(clinic),
      {
        text: 'Pauta de tratamiento',
        fontSize: 16,
        bold: true,
        margin: [0, 0, 0, 16],
      },

      {
        columns: [
          {
            text: [
              { text: 'Paciente: ', bold: true },
              `${patient.firstName} ${patient.lastName}`,
            ],
            fontSize: 10,
          },
          {
            text: [
              { text: 'Fecha: ', bold: true },
              formatClinicDate(entry.visitDate),
            ],
            fontSize: 10,
            alignment: 'right',
          },
        ],
        margin: [0, 0, 0, 4],
      },
      patient.documentId
        ? {
            text: [{ text: 'Documento: ', bold: true }, patient.documentId],
            fontSize: 10,
            margin: [0, 0, 0, 16],
          }
        : { text: '', margin: [0, 0, 0, 16] },

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
