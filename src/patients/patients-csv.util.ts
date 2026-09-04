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

export interface ParsePatientsCsvResult {
  rows: ImportRow[];
  missingColumns: string[];
}

// Reuses the xlsx library for CSV too (it parses CSV natively) instead of
// hand-rolling a parser — quoted commas/newlines inside a field (easy to
// hit in a "Notas" column) are exactly the kind of thing a bespoke parser
// gets wrong.
//
// Decoded to a UTF-8 string ourselves before handing it to XLSX, instead of
// passing the raw buffer: XLSX.read on a buffer guesses the encoding from
// the bytes, and without a BOM it mis-decodes accented headers like
// "Teléfono"/"Dirección" (mojibake) — decoding explicitly here sidesteps
// that guess entirely, whether or not the file carries a BOM.
export function parsePatientsCsv(buffer: Buffer): ParsePatientsCsvResult {
  const text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
  const workbook = XLSX.read(text, { type: 'string', raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
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
      const value = sourceRow[actualHeader];
      let text = '';
      if (typeof value === 'string') {
        text = value.trim();
      } else if (typeof value === 'number') {
        text = String(value);
      }
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
