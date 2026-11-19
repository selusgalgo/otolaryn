import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { ClinicalEntry } from '../clinical-entries/entities/clinical-entry.entity';
import type { Patient } from '../patients/entities/patient.entity';
import { clinicHeader, type ClinicProfileData } from './clinic-header.util';
import {
  formatCalendarDate,
  formatClinicDate,
} from './patient-record-pdf.util';
import { richTextToPdfContent } from './rich-text-to-pdf.util';

export interface ReportPdfData {
  clinic: ClinicProfileData;
  patient: Patient;
  entry: ClinicalEntry;
  insuranceName: string | null;
  // "Dr. Manuel Martín" — null if the author's row is somehow gone.
  authorName: string | null;
}

function labelValue(label: string, value: string): Content {
  return {
    text: [{ text: `${label}: `, bold: true }, value],
    fontSize: 10,
    margin: [0, 0, 0, 3],
  };
}

// Informe médico de una consulta (campo Informe de la plantilla de cirugía):
// a diferencia de la hoja de Tratamiento (A5, sin membrete, para el
// paciente), este es un documento formal — normalmente para el médico que
// remitió al paciente o para su aseguradora —, así que lleva el membrete de
// la clínica, los datos que identifican al paciente y la firma del autor.
export function buildReportPdf(data: ReportPdfData): TDocumentDefinitions {
  const { clinic, patient, entry, insuranceName, authorName } = data;

  const patientLines: Content[] = [
    labelValue('Paciente', `${patient.firstName} ${patient.lastName}`),
  ];
  if (patient.dateOfBirth) {
    patientLines.push(
      labelValue(
        'Fecha de nacimiento',
        formatCalendarDate(patient.dateOfBirth),
      ),
    );
  }
  if (patient.documentId) {
    patientLines.push(labelValue('DNI', patient.documentId));
  }
  if (insuranceName) {
    patientLines.push(
      labelValue(
        'Aseguradora',
        patient.insuranceNumber
          ? `${insuranceName} — Nº ${patient.insuranceNumber}`
          : insuranceName,
      ),
    );
  }
  patientLines.push(
    labelValue('Fecha de consulta', formatClinicDate(entry.visitDate)),
  );
  if (entry.referringDoctor) {
    patientLines.push(labelValue('Remitido por', entry.referringDoctor));
  }

  return {
    info: {
      title: `Informe — ${patient.firstName} ${patient.lastName}`,
    },
    content: [
      ...clinicHeader(clinic),
      {
        text: 'INFORME MÉDICO',
        fontSize: 14,
        bold: true,
        alignment: 'center',
        margin: [0, 6, 0, 14],
      },
      ...patientLines,
      ...(entry.diagnosis
        ? [
            {
              text: 'Diagnóstico',
              bold: true,
              fontSize: 11,
              margin: [0, 12, 0, 4],
            } as Content,
            {
              text: entry.diagnosis,
              fontSize: 10,
            } as Content,
          ]
        : []),
      { text: 'Informe', bold: true, fontSize: 11, margin: [0, 12, 0, 4] },
      entry.report
        ? { stack: richTextToPdfContent(entry.report), fontSize: 10 }
        : { text: 'Sin informe redactado.', fontSize: 10, italics: true },
      ...(authorName
        ? [
            {
              text: `Fdo.: ${authorName}`,
              fontSize: 10,
              alignment: 'right',
              margin: [0, 40, 0, 0],
            } as Content,
          ]
        : []),
    ],
  };
}
