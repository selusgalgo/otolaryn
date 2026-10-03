import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { ClinicalEntry } from '../clinical-entries/entities/clinical-entry.entity';
import type { Patient } from '../patients/entities/patient.entity';
import { clinicHeader } from './clinic-header.util';
import type { ClinicProfileData } from './clinic-header.util';
import { richTextToPdfContent } from './rich-text-to-pdf.util';

export interface MarkedAntecedente {
  name: string;
  detalle: string | null;
}

export interface PatientRecordPdfData {
  clinic: ClinicProfileData;
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

// entries is sorted newest-first (see
// ClinicalEntriesService.findAllForPatientUnpaged), so the earliest visit —
// "fecha de primera consulta" — is simply its last element. There's no
// separate stored column for this (patients.first_consultation_date was
// added then dropped early in the project, see
// DropPatientFirstConsultationDate1734600000000): the patient's own
// consultas are already the source of truth for when they were first seen.
function firstConsultationDate(entries: ClinicalEntry[]): string {
  if (entries.length === 0) return '—';
  return formatClinicDate(entries[entries.length - 1].visitDate);
}

// Three columns of label/value pairs rather than one long two-column table
// — with Nº de historia dropped (internal bookkeeping, not meant for a
// patient-facing export) and Fecha de primera consulta added, there are few
// enough short fields that three columns read as a compact block instead of
// a half-empty page-width table.
function datosPacienteColumns(
  patient: Patient,
  insuranceName: string | null,
  entries: ClinicalEntry[],
): Content {
  const rows: [string, string][] = [
    ['Nombre', `${patient.firstName} ${patient.lastName}`],
    ['Documento', patient.documentId ?? '—'],
    ['Fecha de nacimiento', formatCalendarDate(patient.dateOfBirth)],
    ['Fecha de primera consulta', firstConsultationDate(entries)],
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

  const perColumn = Math.ceil(rows.length / 3);
  const columnRows = [
    rows.slice(0, perColumn),
    rows.slice(perColumn, perColumn * 2),
    rows.slice(perColumn * 2),
  ];

  return {
    columns: columnRows.map((chunk) => ({
      table: {
        widths: ['auto', '*'],
        body: chunk.map(([label, value]) => [
          { text: label, bold: true, fontSize: 8 },
          { text: value, fontSize: 8 },
        ]),
      },
      layout: 'lightHorizontalLines',
    })),
    columnGap: 12,
  };
}

// A single comma-separated line rather than one bullet per item — this
// app's antecedente catalog is configurable per clinic (any name, any
// count), unlike the legacy system this template is modeled on, which
// printed a fixed grid of ~13 always-present fields with blanks for
// whichever weren't marked. A flowing list of just the ones actually
// marked is the natural equivalent, and reads fine for the short items
// (antecedente names, occasionally a short detalle) this is ever made of.
function antecedentesList(items: MarkedAntecedente[]): Content {
  if (items.length === 0) {
    return { text: 'Sin antecedentes marcados.', fontSize: 9, italics: true };
  }
  const text = items
    .map((item) =>
      item.detalle ? `${item.name} (${item.detalle})` : item.name,
    )
    .join(', ');
  return { text, fontSize: 9 };
}

// richTextToPdfContent([]) for an empty/null field — rendered as an em-dash
// instead of a blank gap, so an empty Motivo/Exploración/Tratamiento in a
// consulta block reads as "deliberately empty", not as a layout glitch.
function richOrDash(html: string | null | undefined): Content {
  const content = richTextToPdfContent(html);
  return content.length > 0
    ? { stack: content, fontSize: 9 }
    : { text: '—', fontSize: 9 };
}

function consultaDivider(): Content {
  return {
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: 515,
        y2: 0,
        lineWidth: 0.5,
        lineColor: '#cccccc',
      },
    ],
    margin: [0, 10, 0, 6],
  };
}

// One block per consulta — Fecha, then Motivo at full width, then
// Exploración/Diagnóstico/Tratamiento stacked below it — rather than
// cramming all of that (now rich text, often several lines) into a 5-column
// table row. Mirrors the legacy template's own per-consulta block layout,
// which exists for the same reason: free-text fields don't fit a table.
function consultaBlock(entry: ClinicalEntry): Content[] {
  const blocks: Content[] = [
    consultaDivider(),
    {
      text: [
        { text: 'Fecha de consulta: ', bold: true },
        formatClinicDate(entry.visitDate),
      ],
      fontSize: 9,
      margin: [0, 0, 0, 4],
    },
    { text: 'Motivo', bold: true, fontSize: 9 },
    { stack: [richOrDash(entry.chiefComplaint)], margin: [0, 2, 0, 4] },
  ];
  if (entry.diagnosis) {
    blocks.push({
      text: [{ text: 'Diagnóstico: ', bold: true }, entry.diagnosis],
      fontSize: 9,
      margin: [0, 0, 0, 4],
    });
  }
  blocks.push({
    columns: [
      {
        stack: [
          { text: 'Exploración', bold: true, fontSize: 9 },
          {
            stack: [richOrDash(entry.examinationFindings)],
            margin: [0, 2, 0, 0],
          },
        ],
      },
      {
        stack: [
          { text: 'Tratamiento', bold: true, fontSize: 9 },
          { stack: [richOrDash(entry.treatment)], margin: [0, 2, 0, 0] },
        ],
      },
    ],
    columnGap: 16,
  });
  return blocks;
}

function consultasList(entries: ClinicalEntry[]): Content {
  if (entries.length === 0) {
    return { text: 'Sin consultas todavía.', fontSize: 9, italics: true };
  }
  return { stack: entries.flatMap(consultaBlock) };
}

// The order here is exactly the one requested: Datos del paciente,
// Antecedentes personales, Antecedentes familiares, Historia clínica, and
// below it Consultas (Fecha/Motivo/Exploración/Diagnóstico/Tratamiento).
export function buildPatientRecordPdf(
  data: PatientRecordPdfData,
): TDocumentDefinitions {
  const { clinic, patient, insuranceName, entries } = data;

  return {
    info: {
      title: `Ficha de ${patient.firstName} ${patient.lastName}`,
    },
    content: [
      ...clinicHeader(clinic),
      {
        text: 'Ficha de paciente',
        fontSize: 18,
        bold: true,
        margin: [0, 0, 0, 10],
      },

      sectionTitle('Datos del paciente'),
      datosPacienteColumns(patient, insuranceName, entries),

      sectionTitle('Antecedentes personales'),
      antecedentesList(data.personalAntecedentes),

      sectionTitle('Antecedentes familiares'),
      antecedentesList(data.familiarAntecedentes),

      sectionTitle('Historia clínica'),
      patient.notes
        ? richTextToPdfContent(patient.notes)
        : { text: 'Sin historia clínica todavía.', fontSize: 9, italics: true },

      sectionTitle('Consultas'),
      consultasList(entries),
    ],
  };
}
