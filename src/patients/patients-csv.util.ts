import * as XLSX from 'xlsx';
import { CreatePatientDto } from './dto/create-patient.dto';
import { Patient } from './entities/patient.entity';

// One column list drives both directions — export writes these headers,
// import looks for them (case/accent-insensitively) — so a file round-trips
// through "Exportar" → edit in a spreadsheet → "Importar" without the user
// ever seeing a column name mismatch.
const COLUMNS: { field: keyof CreatePatientDto; label: string }[] = [
  { field: 'firstName', label: 'Nombre' },
  { field: 'lastName', label: 'Apellidos' },
  { field: 'documentId', label: 'Documento' },
  { field: 'dateOfBirth', label: 'Fecha de nacimiento' },
  { field: 'phone', label: 'Teléfono' },
  { field: 'email', label: 'Email' },
  { field: 'address', label: 'Dirección' },
  { field: 'notes', label: 'Notas' },
];

const REQUIRED_FIELDS: (keyof CreatePatientDto)[] = [
  'firstName',
  'lastName',
  'documentId',
  'dateOfBirth',
  'phone',
];

export interface ExportedFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

export function buildPatientsExport(
  patients: Patient[],
  format: 'csv' | 'xlsx',
): ExportedFile {
  const rows = patients.map((p) => {
    const row: Record<string, string> = {};
    for (const { field, label } of COLUMNS) {
      const value = p[field as keyof Patient];
      row[label] = value == null ? '' : String(value);
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

function normalizeHeader(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

export type ImportRow = Partial<Record<keyof CreatePatientDto, string>>;

export interface ParsePatientsFileResult {
  rows: ImportRow[];
  missingColumns: string[];
}

const CSV_EXTENSIONS = ['.csv'];
const SPREADSHEET_EXTENSIONS = ['.xls', '.xlsx'];

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

export function isSupportedImportFile(filename: string): boolean {
  const ext = extensionOf(filename);
  return CSV_EXTENSIONS.includes(ext) || SPREADSHEET_EXTENSIONS.includes(ext);
}

// A date-typed cell (real in XLS/XLSX, never in CSV — a CSV cell is always
// plain text) comes back as a JS Date when read with cellDates: true.
// Formatted with local getters, not toISOString(): a date stored as a
// UTC-midnight instant can render one day off in any timezone behind UTC.
function dateCellToIsoString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function cellToText(value: unknown): string {
  if (value instanceof Date) return dateCellToIsoString(value);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

// Accepts the same formats Exportar produces (CSV, XLSX) plus the legacy
// XLS binary format, since a clinic's own patient spreadsheets are just as
// likely to already be in one of those as in a fresh CSV.
//
// CSV is decoded to a UTF-8 string ourselves before handing it to XLSX,
// instead of passing the raw buffer: XLSX.read on a buffer guesses the
// encoding from the bytes, and without a BOM it mis-decodes accented
// headers like "Teléfono"/"Dirección" (mojibake). XLS/XLSX don't have this
// problem — those formats carry their own encoding metadata — so they're
// read directly as a buffer instead; decoding a binary spreadsheet as UTF-8
// text first would corrupt it.
export function parsePatientsFile(
  buffer: Buffer,
  filename: string,
): ParsePatientsFileResult {
  const ext = extensionOf(filename);
  const workbook = CSV_EXTENSIONS.includes(ext)
    ? XLSX.read(buffer.toString('utf-8').replace(/^\uFEFF/, ''), {
        type: 'string',
        raw: true,
      })
    : XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: true,
  });

  if (raw.length === 0) {
    return { rows: [], missingColumns: [] };
  }

  const actualHeaders = Object.keys(raw[0]);
  const actualByNormalized = new Map(
    actualHeaders.map((h) => [normalizeHeader(h), h]),
  );

  const missingColumns: string[] = [];
  const actualHeaderByField = new Map<keyof CreatePatientDto, string>();
  for (const { field, label } of COLUMNS) {
    const actual = actualByNormalized.get(normalizeHeader(label));
    if (actual) {
      actualHeaderByField.set(field, actual);
    } else if (REQUIRED_FIELDS.includes(field)) {
      missingColumns.push(label);
    }
  }

  if (missingColumns.length > 0) {
    return { rows: [], missingColumns };
  }

  const rows = raw.map((sourceRow) => {
    const row: ImportRow = {};
    for (const { field } of COLUMNS) {
      const actualHeader = actualHeaderByField.get(field);
      if (!actualHeader) continue;
      const text = cellToText(sourceRow[actualHeader]);
      // An empty optional cell must become undefined, not "" — email
      // (and any future @IsOptional field) is only actually skipped by
      // class-validator when the property is undefined; an empty string
      // still runs through @IsEmail and fails.
      if (text) row[field] = text;
    }
    return row;
  });

  return { rows, missingColumns: [] };
}
