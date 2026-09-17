import { randomBytes } from 'node:crypto';
import * as XLSX from 'xlsx';
import {
  cellToDate,
  cellToText,
  isSupportedImportFile,
  normalizeHeader,
  readSheet,
  stripAccents,
} from '../shared/spreadsheet-import.util';
import { CreatePatientDto } from './dto/create-patient.dto';
import { Patient } from './entities/patient.entity';

export { isSupportedImportFile };

// One column list drives every direction — export writes these headers,
// the mapping wizard suggests them as the default guess, and import looks
// for them (case/accent-insensitively) when no explicit mapping is given —
// so a file exported from here round-trips back in without the user ever
// having to map anything by hand.
//
// legacyId/firstConsultationDate are plain scalar fields like the rest —
// insuranceEntityId/antecedentes are deliberately NOT in this list: the
// legacy file carries an aseguradora *name* and antecedente columns, not
// ids, so those two need their own resolution step (name/value -> id) in
// bulkImport rather than a straight column->field copy. See
// FieldMapping/ImportRow below.
const COLUMNS: { field: keyof CreatePatientDto; label: string }[] = [
  { field: 'firstName', label: 'Nombre' },
  { field: 'lastName', label: 'Apellidos' },
  { field: 'documentId', label: 'Documento' },
  { field: 'dateOfBirth', label: 'Fecha de nacimiento' },
  { field: 'phone', label: 'Teléfono' },
  { field: 'email', label: 'Email' },
  { field: 'address', label: 'Dirección' },
  { field: 'notes', label: 'Notas' },
  { field: 'profession', label: 'Profesión' },
  { field: 'legacyId', label: 'Nº de historia' },
  { field: 'firstConsultationDate', label: 'Fecha de la primera cita' },
];

// The mapping target for the aseguradora column — resolved to
// insurance_entity_id (get-or-create by name) in bulkImport, not copied
// as-is the way COLUMNS fields are.
const INSURANCE_NAME_LABEL = 'Aseguradora';

// documentId is deliberately not required here even though
// CreatePatientDto itself requires it — a real-world import (this app's
// own legacy OTOLARYN migration included) often has no equivalent column
// at all, and forcing one to be mapped would either block the import or
// invite mapping some unrelated column to it by mistake. A row with no
// documentId gets a generated placeholder instead — see
// generatePlaceholderDocumentId below.
const REQUIRED_FIELDS: (keyof CreatePatientDto)[] = [
  'firstName',
  'lastName',
  'dateOfBirth',
  'phone',
];

// Short, prefixed so it reads as an intentional placeholder rather than a
// real document number, and random rather than row-indexed so it stays
// unique against every other patient in the tenant (not just within this
// one import) without needing to check the database first.
function generatePlaceholderDocumentId(): string {
  return `SIN-DOC-${randomBytes(4).toString('hex')}`;
}

export interface ExportedFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

// DB storage (and the wire format everywhere else in this app) is ISO —
// this is purely a display convention for the exported file, matching the
// DD/MM/AAAA the import side treats as native (see cellToDate below), so a
// fresh export already round-trips back in without anyone having to
// convert anything by hand.
function isoToDayFirst(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function buildPatientsExport(
  patients: Patient[],
  format: 'csv' | 'xlsx',
): ExportedFile {
  const rows = patients.map((p) => {
    const row: Record<string, string> = {};
    for (const { field, label } of COLUMNS) {
      const value = p[field as keyof Patient];
      const text = value == null ? '' : String(value);
      row[label] = field === 'dateOfBirth' && text ? isoToDayFirst(text) : text;
    }
    return row;
  });

  const sheet = XLSX.utils.json_to_sheet(rows, {
    header: COLUMNS.map((c) => c.label),
  });

  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(sheet);
    // UTF-8 BOM: without it, Excel on Windows guesses Latin-1 and mangles
    // "Teléfono"/"Dirección" and any accented patient name.
    return {
      buffer: Buffer.from('\uFEFF' + csv, 'utf-8'),
      contentType: 'text/csv; charset=utf-8',
      filename: 'pacientes.csv',
    };
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Pacientes');
  const buffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer;
  return {
    buffer,
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: 'pacientes.xlsx',
  };
}

// Antecedente catalog entry, as returned by GET /antecedente-types — only
// id/name matter for mapping purposes.
export interface AntecedenteTypeOption {
  id: string;
  name: string;
}

export type FieldMapping = Partial<Record<keyof CreatePatientDto, string>> & {
  // The file's own column header for the aseguradora name (ENTIDAD in the
  // legacy file) — a name, resolved to insuranceEntityId in bulkImport.
  insuranceEntityName?: string;
  // antecedenteTypeId -> the file's own column header for that antecedente
  // (e.g. the "Tabaco" type's id -> "TABACO"). One target per type passed
  // to suggestMapping/parsePatientsFile, since the legacy file has one
  // column per antecedente rather than a single "antecedentes" column.
  antecedentes?: Record<string, string>;
};

export interface ImportRow extends Partial<
  Record<keyof CreatePatientDto, string>
> {
  // Raw name, not yet resolved to an id — bulkImport does the
  // get-or-create lookup right before creating the patient.
  insuranceEntityName?: string;
  antecedentes?: { antecedenteTypeId: string; detalle: string | null }[];
}

export interface ParsePatientsFileResult {
  rows: ImportRow[];
  missingColumns: string[];
}

// Best-guess mapping from the file's own headers to our fields — matched
// case/accent-insensitively against the label a fresh export would use.
// This is only ever a *suggestion*: a file from another system (e.g. the
// legacy OTOLARYN desktop app, where a patient's own id column is called
// NUMHISTORIA, not "Documento") won't match anything here, which is
// exactly why the import wizard lets a person confirm or override it
// instead of importing blind on a silent mismatch.
// antecedenteTypes is optional and defaults to none — every existing
// caller (tests, a plain patients-only import) keeps working with zero
// antecedente targets offered, same backward-compatible spirit as mapping
// itself being optional below.
export function suggestMapping(
  headers: string[],
  antecedenteTypes: AntecedenteTypeOption[] = [],
): FieldMapping {
  const byNormalized = new Map(headers.map((h) => [normalizeHeader(h), h]));
  const mapping: FieldMapping = {};
  for (const { field, label } of COLUMNS) {
    const actual = byNormalized.get(normalizeHeader(label));
    if (actual) mapping[field] = actual;
  }
  const insuranceHeader = byNormalized.get(
    normalizeHeader(INSURANCE_NAME_LABEL),
  );
  if (insuranceHeader) mapping.insuranceEntityName = insuranceHeader;

  const antecedentes: Record<string, string> = {};
  for (const type of antecedenteTypes) {
    const actual = byNormalized.get(normalizeHeader(type.name));
    if (actual) antecedentes[type.id] = actual;
  }
  if (Object.keys(antecedentes).length > 0) mapping.antecedentes = antecedentes;

  return mapping;
}

const PREVIEW_ROW_COUNT = 5;

export interface ImportPreview {
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedMapping: FieldMapping;
}

// Step 1 of the import wizard: read the file just far enough to show the
// user its columns and a handful of real rows, so they can confirm (or
// fix) the mapping before anything is actually imported.
export function previewPatientsFile(
  buffer: Buffer,
  filename: string,
  antecedenteTypes: AntecedenteTypeOption[] = [],
): ImportPreview {
  const { headers, rows } = readSheet(buffer, filename);
  const sampleRows = rows.slice(0, PREVIEW_ROW_COUNT).map((row) => {
    const display: Record<string, string> = {};
    for (const header of headers) display[header] = cellToText(row[header]);
    return display;
  });
  return {
    headers,
    sampleRows,
    suggestedMapping: suggestMapping(headers, antecedenteTypes),
  };
}

// "no" (any accent/case) never counts as marked, regardless of what else
// is in the cell — matches the exact rule already validated against this
// same legacy data (see the historical migrate-legacy.ts script this
// import wizard supersedes).
function isNegative(raw: string): boolean {
  return stripAccents(raw.trim().toLowerCase()) === 'no';
}

// A bare "sí"/"si" carries no extra information worth keeping as detalle —
// anything else that isn't negative does (e.g. "4-5" cigarrillos/día,
// "Alérgico al melocotón").
function isAffirmative(raw: string): boolean {
  return stripAccents(raw.trim().toLowerCase()) === 'si';
}

function cellToAntecedenteMark(value: unknown): {
  marked: boolean;
  detalle: string | null;
} {
  const text = cellToText(value).trim();
  if (!text || isNegative(text)) return { marked: false, detalle: null };
  return { marked: true, detalle: isAffirmative(text) ? null : text };
}

// NIF (8 digits + control letter) or NIE (X/Y/Z + 7 digits + letter) —
// this legacy export has no Documento column at all, but ~20% of its
// PROFESION cells have one typed in anyway, sometimes alone ("28883086P"),
// sometimes after the real profession ("MAESTRO 28556177K"). A row that
// carries a real NIF this way is worth keeping as the real documentId
// instead of an auto-generated placeholder.
const NIF_NIE_RE = /\b([0-9]{8}[A-Za-z]|[XYZxyz][0-9]{7}[A-Za-z])\b/;

// Only called when the row has no documentId yet (no Documento column
// mapped, or that cell was empty) — an explicitly mapped Documento always
// wins, this is purely a fallback for files that don't have one.
function extractDocumentIdFromProfession(profession: string): {
  profession: string | null;
  documentId: string | null;
} {
  const match = NIF_NIE_RE.exec(profession);
  if (!match) return { profession, documentId: null };
  const remainder = (
    profession.slice(0, match.index) +
    profession.slice(match.index + match[0].length)
  ).trim();
  return { profession: remainder || null, documentId: match[0].toUpperCase() };
}

// Step 2: the actual import, using the mapping the user confirmed in the
// wizard (field -> the file's own header text). Falls back to
// suggestMapping when no mapping is given at all, so a caller that skips
// the wizard entirely (existing tests, a future non-UI integration) keeps
// working the way plain auto-detection always did.
export function parsePatientsFile(
  buffer: Buffer,
  filename: string,
  mapping?: FieldMapping,
  antecedenteTypes: AntecedenteTypeOption[] = [],
): ParsePatientsFileResult {
  const { headers, rows } = readSheet(buffer, filename);
  const effectiveMapping = mapping ?? suggestMapping(headers, antecedenteTypes);

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
    const row: ImportRow = {};
    for (const { field } of COLUMNS) {
      const actualHeader = effectiveMapping[field];
      if (!actualHeader) continue;
      const rawValue = sourceRow[actualHeader];
      const text =
        field === 'dateOfBirth' || field === 'firstConsultationDate'
          ? cellToDate(rawValue)
          : cellToText(rawValue);
      // An empty optional cell must become undefined, not "" — email
      // (and any future @IsOptional field) is only actually skipped by
      // class-validator when the property is undefined; an empty string
      // still runs through @IsEmail and fails.
      if (text) row[field] = text;
    }
    // Fallback, not an override: an explicitly mapped Documento column
    // always wins — this only fires when that cell (or the mapping
    // itself) left documentId empty.
    if (!row.documentId && row.profession) {
      const extracted = extractDocumentIdFromProfession(row.profession);
      if (extracted.documentId) {
        row.documentId = extracted.documentId;
        if (extracted.profession) {
          row.profession = extracted.profession;
        } else {
          delete row.profession;
        }
      }
    }
    if (!row.documentId) {
      row.documentId = generatePlaceholderDocumentId();
    }

    if (effectiveMapping.insuranceEntityName) {
      const name = cellToText(
        sourceRow[effectiveMapping.insuranceEntityName],
      ).trim();
      if (name) row.insuranceEntityName = name;
    }

    if (effectiveMapping.antecedentes) {
      const marked: { antecedenteTypeId: string; detalle: string | null }[] =
        [];
      for (const [antecedenteTypeId, header] of Object.entries(
        effectiveMapping.antecedentes,
      )) {
        const { marked: isMarked, detalle } = cellToAntecedenteMark(
          sourceRow[header],
        );
        if (isMarked) marked.push({ antecedenteTypeId, detalle });
      }
      if (marked.length > 0) row.antecedentes = marked;
    }

    return row;
  });

  return { rows: mappedRows, missingColumns: [] };
}
