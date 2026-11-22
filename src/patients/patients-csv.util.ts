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
import { Patient, type PatientGender } from './entities/patient.entity';

export { isSupportedImportFile };

// One column list drives every direction — export writes these headers,
// the mapping wizard suggests them as the default guess, and import looks
// for them (case/accent-insensitively) when no explicit mapping is given —
// so a file exported from here round-trips back in without the user ever
// having to map anything by hand.
//
// legacyId is a plain scalar field like the rest —
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
  { field: 'gender', label: 'Género' },
  { field: 'phone', label: 'Teléfono' },
  { field: 'phone2', label: 'Teléfono 2' },
  { field: 'email', label: 'Email' },
  { field: 'address', label: 'Dirección' },
  { field: 'city', label: 'Ciudad/Población' },
  { field: 'province', label: 'Provincia' },
  { field: 'postalCode', label: 'C.P.' },
  { field: 'notes', label: 'Notas' },
  { field: 'profession', label: 'Profesión' },
  { field: 'drugAllergies', label: 'Alergias medicamentosas' },
  { field: 'currentMedications', label: 'Medicación actual' },
  { field: 'insuranceNumber', label: 'Nº de seguro privado' },
  { field: 'legacyId', label: 'Nº de historia' },
  { field: 'firstConsultationOverride', label: 'Primera consulta' },
];

// The mapping target for the aseguradora column — resolved to
// insurance_entity_id (get-or-create by name) in bulkImport, not copied
// as-is the way COLUMNS fields are.
const INSURANCE_NAME_LABEL = 'Aseguradora';

// documentId is deliberately not required here — Documento is optional on
// CreatePatientDto itself now (plenty of real patients have none on file),
// so a row without one, or without a mapped column at all, just leaves it
// empty instead of inventing a value.
//
// Same for dateOfBirth and phone: a real legacy file has many patients
// with neither on file, and that row must import with them empty (NULL),
// not be skipped — see ImportPatientDto. That also means a file with no
// Fecha de nacimiento / Teléfono column at all is accepted. Only the
// patient's name is still required: without it the row can't be found or
// booked.
const REQUIRED_FIELDS: (keyof CreatePatientDto)[] = ['firstName', 'lastName'];

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

// Stored lowercase ('hombre'/'mujer', what the DB CHECK allows) — exported
// capitalized for people reading the file; parseGender reads both back.
const GENDER_EXPORT_LABEL: Record<PatientGender, string> = {
  hombre: 'Hombre',
  mujer: 'Mujer',
};

// A legacy file writes gender in many ways: "H"/"M" (hombre/mujer — the
// usual Spanish pair, so a lone "M" is mujer, not "masculino"), but also
// "V" (varón), "F" (femenino), "Masculino", "Femenino"... Anything not on
// this list is left empty (sin indicar) rather than guessed, and never
// makes the row fail.
const GENDER_ALIASES: Record<string, PatientGender> = {
  h: 'hombre',
  hombre: 'hombre',
  v: 'hombre',
  varon: 'hombre',
  masculino: 'hombre',
  m: 'mujer',
  mujer: 'mujer',
  f: 'mujer',
  femenino: 'mujer',
};

export function parseGender(text: string): PatientGender | undefined {
  return GENDER_ALIASES[normalizeHeader(text).replace(/\.$/, '')];
}

// A CSV cell starting with one of these is evaluated as a formula by
// Excel/LibreOffice when the export is opened — and these fields are free
// text any role that creates patients can write. The leading apostrophe
// makes the spreadsheet show the value as plain text. Not needed for XLSX:
// json_to_sheet already writes these as string cells.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

function neutralizeCsvFormula(text: string): string {
  return FORMULA_TRIGGER.test(text) ? `'${text}` : text;
}

export function buildPatientsExport(
  patients: Patient[],
  format: 'csv' | 'xlsx',
): ExportedFile {
  const rows = patients.map((p) => {
    const row: Record<string, string> = {};
    for (const { field, label } of COLUMNS) {
      const value = p[field as keyof Patient];
      const raw = value == null ? '' : String(value);
      const text =
        field === 'dateOfBirth' && raw
          ? isoToDayFirst(raw)
          : field === 'gender' && raw
            ? GENDER_EXPORT_LABEL[raw as PatientGender]
            : raw;
      row[label] = format === 'csv' ? neutralizeCsvFormula(text) : text;
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

// Antecedente catalog entry, as returned by GET /antecedente-types.
// category is only used to break a name collision (see suggestMapping) —
// a clinic can have both a "Tumores" (personal) and a "Tumores" (familiar)
// type, same name on purpose (they're the same topic, asked twice: "have
// you had it" vs "has anyone in your family had it").
export interface AntecedenteTypeOption {
  id: string;
  name: string;
  category?: 'personal' | 'familiar';
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

// Usual names, in files from other systems, for columns whose export label
// ("Teléfono 2", "Género", "Nº de seguro privado") they won't have. Shared by
// the create wizard (suggestMapping) and the update wizard
// (suggestUpdateMapping) so both suggest the same thing. Only fills a field
// the exact-label pass left empty.
function applyHeaderAliases(
  mapping: Partial<Record<keyof CreatePatientDto, string>>,
  byNormalized: Map<string, string>,
): void {
  const alias = (field: keyof CreatePatientDto, names: string[]) => {
    if (mapping[field]) return;
    const header = names.find((name) => byNormalized.has(name));
    if (header) mapping[field] = byNormalized.get(header);
  };
  // A legacy file's own second-phone column is usually called MOVIL.
  alias('phone2', ['movil', 'telefono movil', 'telefono 2']);
  alias('gender', ['sexo', 'genero']);
  // Campos propios del paciente desde PatientAllergiesMedications1738600000000
  // (antes "Alergias medicamentosas" era un antecedente): un fichero legado
  // trae la columna con nombres variados.
  alias('drugAllergies', [
    'alergias',
    'alergia',
    'alergias a medicamentos',
    'alergia a medicamentos',
    'alergia medicamentosa',
    'alergias farmacos',
    'alergia farmacos',
  ]);
  alias('currentMedications', [
    'medicacion',
    'medicamentos',
    'medicacion habitual',
    'tratamiento habitual',
    'tratamiento actual',
    'farmacos',
  ]);
  alias('insuranceNumber', [
    'poliza',
    'n poliza',
    'nº poliza',
    'numero de poliza',
    'tarjeta sanitaria',
    'n tarjeta',
    'nº tarjeta',
  ]);
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
  applyHeaderAliases(mapping, byNormalized);
  const insuranceHeader = byNormalized.get(
    normalizeHeader(INSURANCE_NAME_LABEL),
  );
  if (insuranceHeader) mapping.insuranceEntityName = insuranceHeader;

  // A column name can match more than one antecedente_type — a clinic that
  // asks the same topic twice ("Tumores" personal and "Tumores" familiar)
  // has two rows with the identical normalized name. Mapping the file's
  // one "TUMORES" column to *both* used to mark the patient under both
  // categories for a single legacy value — picking one winner per name
  // (see suggestAntecedenteMapping below) is what fixes that duplicate
  // instead of just moving which pair collides.
  const antecedentes = suggestAntecedenteMapping(
    byNormalized,
    antecedenteTypes,
  );
  if (antecedentes) mapping.antecedentes = antecedentes;

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

// A real legacy TELEFONO cell sometimes carries two numbers in one value
// ("645575702/955761278", "954 25 19 95 / 636 06 89 86") instead of a
// second column. Separators that can never be part of a genuine single
// number are split on: "/", ",", ";", "|", a line break, or the word "y".
// Failing that, a cell of only digits and spaces that adds up to exactly
// two 9-digit numbers ("645575702 955761278", "954 25 19 95 636 06 89 86")
// is split in half. "-" is deliberately NOT a separator ("955-76-12-78" is
// one number). Three parts or more, or a single part, isn't this shape —
// left untouched rather than guessed at.
export function splitPhone(text: string): { phone: string; phone2?: string } {
  const parts = text
    .split(/[/,;|\n\r]|\s+y\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 2) {
    return { phone: parts[0], phone2: parts[1] };
  }
  if (parts.length === 1 && /^[\d\s]+$/.test(text)) {
    const digits = text.replace(/\s+/g, '');
    if (digits.length === 18) {
      return { phone: digits.slice(0, 9), phone2: digits.slice(9) };
    }
  }
  return { phone: text };
}

// Spain's 50 provinces plus the two autonomous cities — a static, closed
// list is exactly what makes the "- PROVINCIA" split below safe: it only
// ever fires when the text after the separator is a real, unambiguous
// province name, never a guess.
const SPANISH_PROVINCES = [
  'A Coruña',
  'Álava',
  'Albacete',
  'Alicante',
  'Almería',
  'Asturias',
  'Ávila',
  'Badajoz',
  'Baleares',
  'Barcelona',
  'Burgos',
  'Cáceres',
  'Cádiz',
  'Cantabria',
  'Castellón',
  'Ciudad Real',
  'Córdoba',
  'Cuenca',
  'Girona',
  'Granada',
  'Guadalajara',
  'Guipúzcoa',
  'Huelva',
  'Huesca',
  'Jaén',
  'La Rioja',
  'Las Palmas',
  'León',
  'Lleida',
  'Lugo',
  'Madrid',
  'Málaga',
  'Murcia',
  'Navarra',
  'Ourense',
  'Palencia',
  'Pontevedra',
  'Salamanca',
  'Santa Cruz de Tenerife',
  'Segovia',
  'Sevilla',
  'Soria',
  'Tarragona',
  'Teruel',
  'Toledo',
  'Valencia',
  'Valladolid',
  'Vizcaya',
  'Zamora',
  'Zaragoza',
  'Ceuta',
  'Melilla',
];
const PROVINCE_BY_NORMALIZED = new Map(
  SPANISH_PROVINCES.map((name) => [normalizeHeader(name), name]),
);

// A real legacy DIRECCION cell is free text with no consistent shape — a
// street, or a bare place name, or (inconsistently) both mashed together
// with a "-" or "." before a town/province that isn't always there. Rather
// than guess at every shape (confirmed against a real 78-row sample: many
// of these are genuinely ambiguous — "TRIANA"/"DOS HERMANAS" appended with
// no separator at all could be a town or a Sevilla neighbourhood, and
// inventing a wrong Ciudad/Provincia is worse than leaving the cell as-is
// in Dirección), this only acts on the two shapes that are unambiguous:
//  - "<street> - <PROVINCIA>" / "<street> . <PROVINCIA>", where PROVINCIA
//    is an exact (accent/case-insensitive) match against the real list of
//    Spanish provinces above — the rest becomes address, province is set,
//    city is deliberately left alone (which town within that province
//    isn't something this can tell).
//  - The whole cell, with no digit and no address-shaped word in it at
//    all ("SEVILLA", "Almonte", "Mairena del Alcor") — the whole thing
//    becomes city, since there's nothing address-like left to keep.
// Everything else — the large middle ground of "street with a town mashed
// on the end, no separator" — is left untouched in address, same as
// today, rather than guessed at.
const ADDRESS_MARKER_RE =
  /\d|n[ºo°.]|avd|avda|c\/|calle|plaza|urb|parcela|bloque|\bbq\b|parque|residen/i;

function splitAddress(text: string): {
  address?: string;
  city?: string;
  province?: string;
} {
  const trimmed = text.trim();
  if (!trimmed) return {};

  const suffixMatch = trimmed.match(/^(.*)[-.]\s*([A-Za-zÀ-ÿ\s]+)$/);
  if (suffixMatch) {
    const province = PROVINCE_BY_NORMALIZED.get(
      normalizeHeader(suffixMatch[2]),
    );
    if (province) {
      const address = suffixMatch[1].trim();
      return address ? { address, province } : { province };
    }
  }

  if (!ADDRESS_MARKER_RE.test(trimmed)) {
    return { city: trimmed.replace(/\s+/g, ' ') };
  }

  return { address: text };
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
        field === 'dateOfBirth' || field === 'firstConsultationOverride'
          ? cellToDate(rawValue)
          : cellToText(rawValue);
      if (!text) continue;
      if (field === 'gender') {
        // Unrecognized value -> left empty instead of failing the row on
        // the DTO's IsIn (see GENDER_ALIASES).
        const gender = parseGender(text);
        if (gender) row.gender = gender;
        continue;
      }
      if (field === 'phone') {
        // An explicit Teléfono 2 column (processed later in this same
        // loop, COLUMNS lists it right after phone) overwrites this if the
        // file actually has one — this split only fires for a file that
        // crams both numbers into the one Teléfono cell.
        const { phone, phone2 } = splitPhone(text);
        row.phone = phone;
        if (phone2) row.phone2 = phone2;
        continue;
      }
      if (field === 'address') {
        // Same precedence as phone/phone2: explicit Ciudad/Provincia
        // columns (processed later in this same loop, COLUMNS lists them
        // right after address) overwrite whatever this guesses.
        const split = splitAddress(text);
        if (split.address) row.address = split.address;
        if (split.city) row.city = split.city;
        if (split.province) row.province = split.province;
        continue;
      }
      // An empty optional cell must become undefined, not "" — email
      // (and any future @IsOptional field) is only actually skipped by
      // class-validator when the property is undefined; an empty string
      // still runs through @IsEmail and fails.
      row[field] = text;
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
    // No further fallback: a row with no Documento column, no NIF found in
    // Profesión, and no cell value just imports with documentId empty —
    // Documento is optional on CreatePatientDto, nothing to invent.

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

// ---------------------------------------------------------------------
// Update mode: deliberately a separate wizard from the one above — this one
// only ever matches an *existing* patient by Nº de historia and touches
// exactly the fields it has a column mapped for, never anything else on the
// record. It exists for re-importing a corrected/extended export onto
// patients already created by the regular importer above.
//
// What the file says wins: a non-empty cell OVERWRITES the stored value
// (decided with the user — "sobrescribir siempre"). An empty cell never
// clears anything: a gap in the file must not wipe a value someone typed in
// by hand.
// ---------------------------------------------------------------------

const UPDATE_LEGACY_ID_LABEL = 'Nº de historia';
const UPDATE_FIRST_CONSULTATION_LABEL = 'Primera consulta';
const UPDATE_NOTES_LABEL = 'Historia clínica';

// Plain patient fields the update wizard can overwrite. Not offered: names
// (an existing patient's identity isn't changed by a re-import), legacyId
// (it's the match key) and notes/firstConsultationOverride (own mappings
// above, with their own handling).
export const UPDATE_PATIENT_FIELDS = [
  'documentId',
  'dateOfBirth',
  'gender',
  'phone',
  'phone2',
  'email',
  'address',
  'city',
  'province',
  'postalCode',
  'profession',
  'drugAllergies',
  'currentMedications',
  'insuranceNumber',
] as const satisfies readonly (keyof CreatePatientDto)[];
export type UpdatePatientField = (typeof UPDATE_PATIENT_FIELDS)[number];

export type UpdateFieldMapping = {
  legacyId?: string;
  firstConsultationOverride?: string;
  notes?: string;
  // The file's aseguradora *name*, resolved (get-or-create) to
  // insuranceEntityId in PatientsService.updateRow, same as the create wizard.
  insuranceEntityName?: string;
  antecedentes?: Record<string, string>;
} & Partial<Record<UpdatePatientField, string>>;

export interface UpdateRow {
  legacyId: string;
  firstConsultationOverride?: string;
  notes?: string;
  insuranceEntityName?: string;
  // Only the plain fields whose cell was non-empty (already normalized:
  // ISO dates, gender as hombre/mujer, phone split in two).
  fields?: Partial<Record<UpdatePatientField, string>>;
  antecedentes?: { antecedenteTypeId: string; detalle: string | null }[];
}

export interface ParsePatientsUpdateFileResult {
  rows: UpdateRow[];
  missingColumns: string[];
}

export interface UpdateImportPreview {
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedMapping: UpdateFieldMapping;
}

// Shared by suggestMapping and suggestUpdateMapping — a column name can
// match more than one antecedente_type (a clinic that asks the same topic
// twice, "Tumores" personal and "Tumores" familiar, has two rows with the
// identical normalized name). Mapping the file's one "TUMORES" column to
// *both* used to mark the patient under both categories for a single
// legacy value; picking one winner per name is what fixes that duplicate
// instead of just moving which pair collides. familiar wins the tie: the
// legacy columns this matters for (TUMORES/SORDERA/OTRAS) are the
// clinic's own family-history questions, not personal history that
// happens to share a name.
function suggestAntecedenteMapping(
  byNormalized: Map<string, string>,
  antecedenteTypes: AntecedenteTypeOption[],
): Record<string, string> | undefined {
  const byNormalizedName = new Map<string, AntecedenteTypeOption[]>();
  for (const type of antecedenteTypes) {
    const key = normalizeHeader(type.name);
    const group = byNormalizedName.get(key);
    if (group) group.push(type);
    else byNormalizedName.set(key, [type]);
  }
  const antecedentes: Record<string, string> = {};
  for (const group of byNormalizedName.values()) {
    const actual = byNormalized.get(normalizeHeader(group[0].name));
    if (!actual) continue;
    const winner = group.find((t) => t.category === 'familiar') ?? group[0];
    antecedentes[winner.id] = actual;
  }
  return Object.keys(antecedentes).length > 0 ? antecedentes : undefined;
}

function isUpdatePatientField(field: string): field is UpdatePatientField {
  return (UPDATE_PATIENT_FIELDS as readonly string[]).includes(field);
}

export function suggestUpdateMapping(
  headers: string[],
  antecedenteTypes: AntecedenteTypeOption[] = [],
): UpdateFieldMapping {
  const byNormalized = new Map(headers.map((h) => [normalizeHeader(h), h]));
  const mapping: UpdateFieldMapping = {};
  const legacyHeader = byNormalized.get(
    normalizeHeader(UPDATE_LEGACY_ID_LABEL),
  );
  if (legacyHeader) mapping.legacyId = legacyHeader;
  const firstConsultationHeader = byNormalized.get(
    normalizeHeader(UPDATE_FIRST_CONSULTATION_LABEL),
  );
  if (firstConsultationHeader) {
    mapping.firstConsultationOverride = firstConsultationHeader;
  }
  const notesHeader = byNormalized.get(normalizeHeader(UPDATE_NOTES_LABEL));
  if (notesHeader) mapping.notes = notesHeader;
  for (const { field, label } of COLUMNS) {
    if (!isUpdatePatientField(field)) continue;
    const actual = byNormalized.get(normalizeHeader(label));
    if (actual) mapping[field] = actual;
  }
  applyHeaderAliases(mapping, byNormalized);
  const insuranceHeader = byNormalized.get(
    normalizeHeader(INSURANCE_NAME_LABEL),
  );
  if (insuranceHeader) mapping.insuranceEntityName = insuranceHeader;
  const antecedentes = suggestAntecedenteMapping(
    byNormalized,
    antecedenteTypes,
  );
  if (antecedentes) mapping.antecedentes = antecedentes;
  return mapping;
}

export function previewPatientsUpdateFile(
  buffer: Buffer,
  filename: string,
  antecedenteTypes: AntecedenteTypeOption[] = [],
): UpdateImportPreview {
  const { headers, rows } = readSheet(buffer, filename);
  const sampleRows = rows.slice(0, PREVIEW_ROW_COUNT).map((row) => {
    const display: Record<string, string> = {};
    for (const header of headers) display[header] = cellToText(row[header]);
    return display;
  });
  return {
    headers,
    sampleRows,
    suggestedMapping: suggestUpdateMapping(headers, antecedenteTypes),
  };
}

// The plain patient fields of one file row, normalized the same way the
// create wizard does it (parsePatientsFile): dates to ISO, gender to
// hombre/mujer (an unrecognized value is dropped, never fails the row), and
// a Teléfono cell with two numbers split in two — an explicit Teléfono 2
// column wins over that split. Empty cells are simply absent: they never
// clear a stored value.
function updateFieldsFromRow(
  sourceRow: Record<string, unknown>,
  mapping: UpdateFieldMapping,
): Partial<Record<UpdatePatientField, string>> {
  const fields: Partial<Record<UpdatePatientField, string>> = {};
  for (const field of UPDATE_PATIENT_FIELDS) {
    const header = mapping[field];
    if (!header) continue;
    const text =
      field === 'dateOfBirth'
        ? cellToDate(sourceRow[header])
        : cellToText(sourceRow[header]).trim();
    if (!text) continue;
    if (field === 'gender') {
      const gender = parseGender(text);
      if (gender) fields.gender = gender;
    } else if (field === 'phone') {
      const { phone, phone2 } = splitPhone(text);
      fields.phone = phone;
      if (phone2 && !mapping.phone2) fields.phone2 = phone2;
    } else {
      fields[field] = text;
    }
  }
  return fields;
}

// legacyId is required at the mapping level (no column chosen at all ->
// the whole file is rejected upfront, same as the regular importer's
// required fields) — but an individual row with an *empty* legacyId cell
// isn't rejected here; it's reported per-row by the caller (nothing to
// match it to), same spirit as every other per-row skip reason.
export function parsePatientsUpdateFile(
  buffer: Buffer,
  filename: string,
  mapping?: UpdateFieldMapping,
  antecedenteTypes: AntecedenteTypeOption[] = [],
): ParsePatientsUpdateFileResult {
  const { headers, rows } = readSheet(buffer, filename);
  const effectiveMapping =
    mapping ?? suggestUpdateMapping(headers, antecedenteTypes);

  if (!effectiveMapping.legacyId) {
    return { rows: [], missingColumns: [UPDATE_LEGACY_ID_LABEL] };
  }

  const mappedRows = rows.map((sourceRow) => {
    const row: UpdateRow = {
      legacyId: cellToText(sourceRow[effectiveMapping.legacyId!]).trim(),
    };
    if (effectiveMapping.firstConsultationOverride) {
      const text = cellToDate(
        sourceRow[effectiveMapping.firstConsultationOverride],
      );
      if (text) row.firstConsultationOverride = text;
    }
    if (effectiveMapping.notes) {
      // Celda vacía = no tocar lo que ya haya guardado el paciente, igual
      // que Primera consulta arriba — un hueco en el fichero no debe
      // borrar una historia clínica ya escrita a mano en la aplicación.
      const text = cellToText(sourceRow[effectiveMapping.notes]).trim();
      if (text) row.notes = text;
    }
    const fields = updateFieldsFromRow(sourceRow, effectiveMapping);
    if (Object.keys(fields).length > 0) row.fields = fields;
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
