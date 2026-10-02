import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { ClinicalEntry } from '../clinical-entries/entities/clinical-entry.entity';
import type { Patient } from '../patients/entities/patient.entity';
import { richTextToPdfContent } from './rich-text-to-pdf.util';

export interface MarkedAntecedente {
  name: string;
  detalle: string | null;
}

export interface PatientRecordPdfData {
  clinicName: string;
  patient: Patient;
  insuranceName: string | null;
  personalAntecedentes: MarkedAntecedente[];
  familiarAntecedentes: MarkedAntecedente[];
  entries: ClinicalEntry[];
}

// dateOfBirth is a pure calendar date (Postgres `date`, no time-of-day or
// timezone attached) — regex-extracted straight from the "YYYY-MM-DD"
// string TypeORM returns for it, same approach as the frontend's own
// formatDateOnly (web/src/lib/utils.ts), rather than routing it through a
// Date object: `new Date("1980-05-10")` is UTC midnight, which renders as
// the day *before* once formatted in a server whose local zone sits west
// of UTC — a real, easy-to-miss off-by-one for a value that was never a
// point in time to begin with.
function formatCalendarDate(value: string | null): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '—';
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

// visitDate/createdAt are `timestamptz` — real points in time, so unlike
// dateOfBirth above they do need an explicit timezone to render as a
// calendar date. Europe/Madrid, same as AppointmentsService's own
// CLINIC_TIME_ZONE: this app is built for one clinic in Spain, and a PDF
// generated on a server running in any other zone (UTC is typical) must
// still show the clinic's own day, not the server's.
const CLINIC_TIME_ZONE = 'Europe/Madrid';

function formatClinicDate(value: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: CLINIC_TIME_ZONE,
  }).format(value);
}

function sectionTitle(text: string): Content {
  return { text, fontSize: 13, bold: true, margin: [0, 14, 0, 6] };
}

function datosPacienteTable(
  patient: Patient,
  insuranceName: string | null,
): Content {
  const rows: [string, string][] = [
    ['Nombre', `${patient.firstName} ${patient.lastName}`],
    ['Nº de historia', patient.legacyId ?? '—'],
    ['Documento', patient.documentId ?? '—'],
    ['Fecha de nacimiento', formatCalendarDate(patient.dateOfBirth)],
    ['Teléfono', patient.phone],
    ['Teléfono 2', patient.phone2 ?? '—'],
    ['Email', patient.email ?? '—'],
    [
      'Dirección',
      [patient.address, patient.postalCode, patient.city, patient.province]
        .filter(Boolean)
        .join(', ') || '—',
    ],
    ['Profesión', patient.profession ?? '—'],
    ['Aseguradora', insuranceName ?? '—'],
  ];
  return {
    table: {
      widths: ['auto', '*'],
      body: rows.map(([label, value]) => [
        { text: label, bold: true, fontSize: 9 },
        { text: value, fontSize: 9 },
      ]),
    },
    layout: 'lightHorizontalLines',
  };
}

function antecedentesList(items: MarkedAntecedente[]): Content {
  if (items.length === 0) {
    return { text: 'Sin antecedentes marcados.', fontSize: 9, italics: true };
  }
  return {
    ul: items.map((item) => ({
      text: item.detalle ? `${item.name} — ${item.detalle}` : item.name,
      fontSize: 9,
    })),
  };
}

function consultasTable(entries: ClinicalEntry[]): Content {
  if (entries.length === 0) {
    return { text: 'Sin consultas todavía.', fontSize: 9, italics: true };
  }
  const header = [
    'Fecha',
    'Motivo',
    'Exploración',
    'Diagnóstico',
    'Tratamiento',
  ].map((text) => ({ text, bold: true, fontSize: 9 }));
  const body = entries.map((entry) => [
    { text: formatClinicDate(entry.visitDate), fontSize: 8 },
    { stack: richTextToPdfContent(entry.chiefComplaint), fontSize: 8 },
    { stack: richTextToPdfContent(entry.examinationFindings), fontSize: 8 },
    { text: entry.diagnosis ?? '—', fontSize: 8 },
    { stack: richTextToPdfContent(entry.treatment), fontSize: 8 },
  ]);
  return {
    table: {
      headerRows: 1,
      widths: ['auto', '*', '*', '*', '*'],
      body: [header, ...body],
    },
    layout: 'lightHorizontalLines',
  };
}

// The order here is exactly the one requested: Datos del paciente,
// Antecedentes personales, Antecedentes familiares, Historia clínica, and
// below it Consultas (Fecha/Motivo/Exploración/Diagnóstico/Tratamiento).
export function buildPatientRecordPdf(
  data: PatientRecordPdfData,
): TDocumentDefinitions {
  const { clinicName, patient, insuranceName, entries } = data;

  return {
    info: {
      title: `Ficha de ${patient.firstName} ${patient.lastName}`,
    },
    content: [
      { text: clinicName, fontSize: 9, color: '#666666' },
      {
        text: 'Ficha de paciente',
        fontSize: 18,
        bold: true,
        margin: [0, 2, 0, 10],
      },

      sectionTitle('Datos del paciente'),
      datosPacienteTable(patient, insuranceName),

      sectionTitle('Antecedentes personales'),
      antecedentesList(data.personalAntecedentes),

      sectionTitle('Antecedentes familiares'),
      antecedentesList(data.familiarAntecedentes),

      sectionTitle('Historia clínica'),
      patient.notes
        ? richTextToPdfContent(patient.notes)
        : { text: 'Sin historia clínica todavía.', fontSize: 9, italics: true },

      sectionTitle('Consultas'),
      consultasTable(entries),
    ],
  };
}
