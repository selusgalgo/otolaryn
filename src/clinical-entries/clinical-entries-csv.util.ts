import {
  cellToDate,
  cellToText,
  isSupportedImportFile,
  normalizeHeader,
  readSheet,
} from '../shared/spreadsheet-import.util';

export { isSupportedImportFile };

// Same shape of problem as patients-csv.util.ts's COLUMNS, scaled down:
// three fields that copy straight across. visitDate/patientLegacyId/
// insuranceEntityName/doctorName all need their own handling in
// bulkImport (a date to parse, a NUMHISTORIA to resolve to a patient, a
// name to resolve to an insurance_entity_id, a free-text doctor name to
// resolve to a user id) instead of a plain column->field copy, so they're
// modeled separately below rather than in this list.
const COLUMNS: {
  field: 'chiefComplaint' | 'examinationFindings' | 'treatment';
  label: string;
}[] = [
  { field: 'chiefComplaint', label: 'Motivo' },
  { field: 'examinationFindings', label: 'Exploración' },
  { field: 'treatment', label: 'Tratamiento' },
];

const VISIT_DATE_LABEL = 'Fecha';
const PATIENT_LEGACY_ID_LABEL = 'Nº de historia';
const INSURANCE_NAME_LABEL = 'Aseguradora';
const DOCTOR_NAME_LABEL = 'Doctor';

// Motivo is the one thing a consulta can't be imported without — the rest
// (paciente/médico/aseguradora resolution) is validated row by row in
// ClinicalEntriesService.bulkImport instead, since those failures depend
// on data outside this file (does that legacy_id/doctor mapping exist),
// not on the file's own shape.
const REQUIRED_FIELDS: (typeof COLUMNS)[number]['field'][] = ['chiefComplaint'];

export interface ClinicalEntryFieldMapping {
  chiefComplaint?: string;
  examinationFindings?: string;
  treatment?: string;
  visitDate?: string;
  patientLegacyId?: string;
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
): ClinicalEntryFieldMapping {
  const byNormalized = new Map(headers.map((h) => [normalizeHeader(h), h]));
  const mapping: ClinicalEntryFieldMapping = {};
  for (const { field, label } of COLUMNS) {
    const actual = byNormalized.get(normalizeHeader(label));
    if (actual) mapping[field] = actual;
  }
  const visitDateHeader = byNormalized.get(normalizeHeader(VISIT_DATE_LABEL));
  if (visitDateHeader) mapping.visitDate = visitDateHeader;
  const legacyIdHeader = byNormalized.get(
    normalizeHeader(PATIENT_LEGACY_ID_LABEL),
  );
  if (legacyIdHeader) mapping.patientLegacyId = legacyIdHeader;
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
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedMapping: ClinicalEntryFieldMapping;
}

export function previewClinicalEntriesFile(
  buffer: Buffer,
  filename: string,
): ClinicalEntriesImportPreview {
  const { headers, rows } = readSheet(buffer, filename);
  const sampleRows = rows.slice(0, PREVIEW_ROW_COUNT).map((row) => {
    const display: Record<string, string> = {};
    for (const header of headers) display[header] = cellToText(row[header]);
    return display;
  });
  return {
    headers,
    sampleRows,
    suggestedMapping: suggestClinicalEntryMapping(headers),
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

export interface ClinicalEntryImportRow {
  chiefComplaint?: string;
  examinationFindings?: string;
  treatment?: string;
  visitDate?: string;
  patientLegacyId?: string;
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
): ParseClinicalEntriesResult {
  const { headers, rows } = readSheet(buffer, filename);
  const effectiveMapping = mapping ?? suggestClinicalEntryMapping(headers);

  const missingColumns: string[] = [];
  for (const { field, label } of COLUMNS) {
    if (REQUIRED_FIELDS.includes(field) && !effectiveMapping[field]) {
      missingColumns.push(label);
    }
  }
  if (missingColumns.length > 0) {
    return { rows: [], missingColumns };
  }

  const mappedRows = rows.map((sourceRow) => {
    const row: ClinicalEntryImportRow = {};
    for (const { field } of COLUMNS) {
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
