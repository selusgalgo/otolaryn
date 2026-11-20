import {
  type ConsultationField,
  type ConsultationTemplate,
  DEFAULT_CONSULTATION_TEMPLATE,
  fieldLabel,
  TEMPLATE_DEFINITIONS,
} from './consultation-template';
import {
  cellToDate,
  cellToText,
  isSupportedImportFile,
  normalizeHeader,
  readSheet,
} from '../shared/spreadsheet-import.util';

export { isSupportedImportFile };

// Campos de texto de la consulta que se copian tal cual de una columna.
// Cuáles se ofrecen depende de la plantilla de la clínica
// (consultation-template.ts): una clínica de Cirugía importa Enfermedad
// actual/Evolución/Diagnóstico/Informe/Doctor que lo envía, una de ORL
// Motivo/Exploración/Diagnóstico/Tratamiento/Notas de seguimiento. Un campo
// que la plantilla no usa ni se sugiere ni se importa aunque venga mapeado.
//
// visitDate/patientLegacyId/insuranceEntityName/doctorName need their own
// handling in bulkImport (a date to parse, a NUMHISTORIA to resolve to a
// patient, a name to resolve to an insurance_entity_id, a free-text doctor
// name to resolve to a user id) instead of a plain column->field copy, so
// they're modeled separately below.
//
// ALIASES: cabeceras alternativas que también se reconocen al sugerir el
// mapeo, además de la etiqueta de la plantilla y la etiqueta por defecto
// (p. ej. "Motivo" a secas, o "Enfermedad actual" en un fichero de ORL).
const ALIASES: Partial<Record<ConsultationField, string[]>> = {
  chiefComplaint: ['Motivo', 'Motivo de consulta', 'Enfermedad actual'],
  followUpNotes: ['Seguimiento'],
  referringDoctor: [
    'Médico que lo envía',
    'Remitente',
    'Derivado por',
    'Médico remitente',
  ],
};

export function importableFields(
  template: ConsultationTemplate,
): ConsultationField[] {
  return TEMPLATE_DEFINITIONS[template].fields;
}

function candidateHeaders(
  template: ConsultationTemplate,
  field: ConsultationField,
): string[] {
  return [
    fieldLabel(template, field),
    fieldLabel(DEFAULT_CONSULTATION_TEMPLATE, field),
    ...(ALIASES[field] ?? []),
  ];
}

const VISIT_DATE_LABEL = 'Fecha';
const PATIENT_LEGACY_ID_LABEL = 'Nº de historia';
// Same header names the Pacientes importer suggests for firstName/lastName
// — a real consultas.xls repeats the patient's own name on every row
// (NOMBRE/APELLIDOS), which is exactly what lets bulkImport double-check a
// legacy_id match against a name instead of trusting it blindly (see
// name-similarity.util.ts).
const PATIENT_FIRST_NAME_LABEL = 'Nombre';
const PATIENT_LAST_NAME_LABEL = 'Apellidos';
const INSURANCE_NAME_LABEL = 'Aseguradora';
const DOCTOR_NAME_LABEL = 'Doctor';

// Motivo/Enfermedad actual is the one thing a consulta can't be imported
// without — the rest (paciente/médico/aseguradora resolution) is validated
// row by row in ClinicalEntriesService.bulkImport instead, since those
// failures depend on data outside this file (does that legacy_id/doctor
// mapping exist), not on the file's own shape.
const REQUIRED_FIELDS: ConsultationField[] = ['chiefComplaint'];

export type ClinicalEntryTextFields = Partial<
  Record<ConsultationField, string>
>;

export interface ClinicalEntryFieldMapping extends ClinicalEntryTextFields {
  visitDate?: string;
  patientLegacyId?: string;
  patientFirstName?: string;
  patientLastName?: string;
  insuranceEntityName?: string;
  doctorName?: string;
}

// Best-guess mapping, same spirit as patients' suggestMapping — matched
// case/accent-insensitively against the label a person would recognize,
// never against the legacy file's own header names (NUMHISTORIA/ENTIDAD/
// DOCTOR won't match anything here on purpose; the wizard is what lets
// someone confirm those by hand).
export function suggestClinicalEntryMapping(
  headers: string[],
  template: ConsultationTemplate = DEFAULT_CONSULTATION_TEMPLATE,
): ClinicalEntryFieldMapping {
  const byNormalized = new Map(headers.map((h) => [normalizeHeader(h), h]));
  const mapping: ClinicalEntryFieldMapping = {};
  const used = new Set<string>();
  for (const field of importableFields(template)) {
    for (const candidate of candidateHeaders(template, field)) {
      const actual = byNormalized.get(normalizeHeader(candidate));
      // Una misma columna nunca se sugiere para dos campos.
      if (actual && !used.has(actual)) {
        mapping[field] = actual;
        used.add(actual);
        break;
      }
    }
  }
  const visitDateHeader = byNormalized.get(normalizeHeader(VISIT_DATE_LABEL));
  if (visitDateHeader) mapping.visitDate = visitDateHeader;
  const legacyIdHeader = byNormalized.get(
    normalizeHeader(PATIENT_LEGACY_ID_LABEL),
  );
  if (legacyIdHeader) mapping.patientLegacyId = legacyIdHeader;
  const patientFirstNameHeader = byNormalized.get(
    normalizeHeader(PATIENT_FIRST_NAME_LABEL),
  );
  if (patientFirstNameHeader) mapping.patientFirstName = patientFirstNameHeader;
  const patientLastNameHeader = byNormalized.get(
    normalizeHeader(PATIENT_LAST_NAME_LABEL),
  );
  if (patientLastNameHeader) mapping.patientLastName = patientLastNameHeader;
  const insuranceHeader = byNormalized.get(
    normalizeHeader(INSURANCE_NAME_LABEL),
  );
  if (insuranceHeader) mapping.insuranceEntityName = insuranceHeader;
  const doctorHeader = byNormalized.get(normalizeHeader(DOCTOR_NAME_LABEL));
  if (doctorHeader) mapping.doctorName = doctorHeader;
  return mapping;
}

const PREVIEW_ROW_COUNT = 5;

export interface ClinicalEntriesImportPreview {
  // La plantilla de la clínica: el asistente pinta un selector por cada
  // campo de esa plantilla, con sus etiquetas.
  template: ConsultationTemplate;
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedMapping: ClinicalEntryFieldMapping;
}

export function previewClinicalEntriesFile(
  buffer: Buffer,
  filename: string,
  template: ConsultationTemplate = DEFAULT_CONSULTATION_TEMPLATE,
): ClinicalEntriesImportPreview {
  const { headers, rows } = readSheet(buffer, filename);
  const sampleRows = rows.slice(0, PREVIEW_ROW_COUNT).map((row) => {
    const display: Record<string, string> = {};
    for (const header of headers) display[header] = cellToText(row[header]);
    return display;
  });
  return {
    template,
    headers,
    sampleRows,
    suggestedMapping: suggestClinicalEntryMapping(headers, template),
  };
}

// Every distinct raw DOCTOR value across the *whole* file, not just the
// preview sample — the doctor-resolution wizard step needs every name
// that will actually need mapping to a real user, and a legacy file's
// doctor almost never appears only in the first 5 rows.
export function distinctDoctorNames(
  buffer: Buffer,
  filename: string,
  mapping: ClinicalEntryFieldMapping,
): string[] {
  if (!mapping.doctorName) return [];
  const { rows } = readSheet(buffer, filename);
  const seen = new Set<string>();
  for (const row of rows) {
    const name = cellToText(row[mapping.doctorName]).trim();
    if (name) seen.add(name);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, 'es'));
}

export interface ClinicalEntryImportRow extends ClinicalEntryTextFields {
  visitDate?: string;
  patientLegacyId?: string;
  // The row's own patient name, kept purely as a sanity check against the
  // patient legacy_id actually resolves to — see bulkImport and
  // name-similarity.util.ts. Never used to resolve the patient itself.
  patientFirstName?: string;
  patientLastName?: string;
  insuranceEntityName?: string;
  // Raw name, not yet resolved to a user id — bulkImport looks it up in
  // the doctorMapping confirmed in the wizard's resolution step.
  doctorName?: string;
}

export interface ParseClinicalEntriesResult {
  rows: ClinicalEntryImportRow[];
  missingColumns: string[];
}

export function parseClinicalEntriesFile(
  buffer: Buffer,
  filename: string,
  mapping?: ClinicalEntryFieldMapping,
  template: ConsultationTemplate = DEFAULT_CONSULTATION_TEMPLATE,
): ParseClinicalEntriesResult {
  const { headers, rows } = readSheet(buffer, filename);
  const effectiveMapping =
    mapping ?? suggestClinicalEntryMapping(headers, template);
  const fields = importableFields(template);

  const missingColumns: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    if (!effectiveMapping[field]) {
      missingColumns.push(fieldLabel(template, field));
    }
  }
  if (missingColumns.length > 0) {
    return { rows: [], missingColumns };
  }

  const mappedRows = rows.map((sourceRow) => {
    const row: ClinicalEntryImportRow = {};
    for (const field of fields) {
      const header = effectiveMapping[field];
      if (!header) continue;
      const text = cellToText(sourceRow[header]);
      if (text) row[field] = text;
    }
    if (effectiveMapping.visitDate) {
      const text = cellToDate(sourceRow[effectiveMapping.visitDate]);
      if (text) row.visitDate = text;
    }
    if (effectiveMapping.patientLegacyId) {
      const text = cellToText(
        sourceRow[effectiveMapping.patientLegacyId],
      ).trim();
      if (text) row.patientLegacyId = text;
    }
    if (effectiveMapping.patientFirstName) {
      const text = cellToText(
        sourceRow[effectiveMapping.patientFirstName],
      ).trim();
      if (text) row.patientFirstName = text;
    }
    if (effectiveMapping.patientLastName) {
      const text = cellToText(
        sourceRow[effectiveMapping.patientLastName],
      ).trim();
      if (text) row.patientLastName = text;
    }
    if (effectiveMapping.insuranceEntityName) {
      const text = cellToText(
        sourceRow[effectiveMapping.insuranceEntityName],
      ).trim();
      if (text) row.insuranceEntityName = text;
    }
    if (effectiveMapping.doctorName) {
      const text = cellToText(sourceRow[effectiveMapping.doctorName]).trim();
      if (text) row.doctorName = text;
    }
    return row;
  });

  return { rows: mappedRows, missingColumns: [] };
}
