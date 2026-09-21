import * as XLSX from 'xlsx';

// xlsx's own type declarations give SSF a bare `any` — narrowed here to the
// one function actually used, so that stays the only unsafe-cast in the
// file instead of every call site needing its own.
interface DateCode {
  y: number;
  m: number;
  d: number;
}
const SSF = XLSX.SSF as unknown as {
  parse_date_code(value: number): DateCode | undefined;
};

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

export interface RawSheet {
  // Original header text, in file column order — a mapping is chosen (or
  // suggested) from these, never from our own field names.
  headers: string[];
  rows: Record<string, unknown>[];
}

// Accepts CSV, XLSX and the legacy XLS binary format — shared by every
// importer in the app (Pacientes, Consultas) since none of this depends on
// what the columns actually mean.
//
// CSV is decoded to a UTF-8 string ourselves before handing it to XLSX,
// instead of passing the raw buffer: XLSX.read on a buffer guesses the
// encoding from the bytes, and without a BOM it mis-decodes accented
// headers like "Teléfono"/"Dirección" (mojibake). XLS/XLSX don't have this
// problem — those formats carry their own encoding metadata — so they're
// read directly as a buffer instead; decoding a binary spreadsheet as UTF-8
// text first would corrupt it.
export function readSheet(buffer: Buffer, filename: string): RawSheet {
  const ext = extensionOf(filename);
  const workbook = CSV_EXTENSIONS.includes(ext)
    ? XLSX.read(buffer.toString('utf-8').replace(/^\uFEFF/, ''), {
        type: 'string',
        raw: true,
      })
    : XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: true,
  });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

// A date-typed cell (real in XLS/XLSX, never in CSV — a CSV cell is always
// plain text) comes back as a JS Date when read with cellDates: true.
// Formatted with local getters, not toISOString(): a date stored as a
// UTC-midnight instant can render one day off in any timezone behind UTC.
function dateCellToIsoString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function cellToText(value: unknown): string {
  if (value instanceof Date) return dateCellToIsoString(value);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

// Any date-shaped field (dateOfBirth, a consulta's FECHA) gets this
// instead of the generic cellToText above, because a real
// spreadsheet hands dates two shapes that aren't already ISO and would
// otherwise fail an @IsDateString() field outright:
//  - Day-first text, e.g. "21/08/1976" — the format a person types by
//    hand, or that a legacy system (this app's own OTOLARYN migration
//    included) exports as plain text.
//  - A bare Excel date serial number, e.g. 45520 — happens when the
//    source cell is formatted as "General" instead of an actual date
//    type, so XLSX.read's cellDates:true never turns it into a real
//    Date the way a properly-formatted cell would.
// Anything else (already ISO, or simply not a date) passes through
// unchanged, so validation still reports it plainly instead of this
// function silently inventing a value.
export function cellToDate(value: unknown): string {
  if (value instanceof Date) return dateCellToIsoString(value);

  if (typeof value === 'number') {
    const parsed = SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
    return String(value);
  }

  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const dayFirst = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = Number(dayFirst[2]);
    const year = Number(dayFirst[3]);
    const date = new Date(year, month - 1, day);
    // Rejects e.g. 31/02/2020 — new Date() would otherwise silently roll
    // it into March, hiding a bad source value instead of reporting it.
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return text;
}

export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizeHeader(value: string): string {
  return stripAccents(value).trim().toLowerCase();
}
