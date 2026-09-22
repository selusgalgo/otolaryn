import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Plain twMerge doesn't know about the custom `--text-heading`/`--text-body`/
// `--text-button` font-size tokens defined in globals.css (it only reads its
// own built-in scale, not the project's @theme block) — without this it
// classifies `text-button` as a text-color utility, sees it in the same
// group as a genuine color class like `text-primary-foreground`, and drops
// whichever one comes first.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["heading", "body", "button"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Every plain (no time component) date the app displays — currently just
// dateOfBirth — reads as DD/MM/AAAA, regardless of the viewer's browser
// locale. A datetime (created_at, an appointment's scheduled_at) is a
// different concern and keeps using toLocaleString with dateStyle/timeStyle
// wherever that's already done — this is only for a bare "date" column.
export function formatDateOnly(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

const SHORT_MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sept", "oct", "nov", "dic",
];

// Same regex-on-the-raw-string approach as formatDateOnly, and for the same
// reason — going through `new Date(iso)` first risks a timezone-driven
// off-by-one on a date-only value. "18 sept 2026" style, used where that
// reads better than the plain DD/MM/AAAA above (e.g. the patients table).
export function formatDateShort(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  const [, year, month, day] = match;
  return `${Number(day)} ${SHORT_MONTHS_ES[Number(month) - 1]} ${year}`;
}

// Whole years only, computed against today in the viewer's own local time
// (this always renders client-side, in the ficha) — a birthday that hasn't
// happened yet this year doesn't count towards the age.
export function calculateAge(dateOfBirth: string): number {
  const match = dateOfBirth.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return NaN;
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const today = new Date();
  let age = today.getFullYear() - year;
  const hadBirthdayThisYear =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

// Documento is optional — null for a patient that never had one. Rows
// imported before that placeholder scheme was retired can still carry a
// "SIN-DOC-982e4abe"-shaped value (see the old generatePlaceholderDocumentId
// in patients-csv.util.ts); both read the same as "no documento" here, so
// anywhere the app displays documentId to a person, render it through this
// instead of the raw value.
export function formatDocumentId(documentId: string | null): string {
  return documentId && !documentId.startsWith("SIN-DOC-") ? documentId : "-";
}

// A compact one-line preview of rich-text HTML (Motivo, in the Historia
// clínica table) — a table row has no room for real headings/lists, so
// this collapses block boundaries to spaces and drops every tag rather
// than rendering (or, worse, showing literal "<p>...") markup inline.
export function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|li|h[1-3]|blockquote)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// A few call sites only carry a combined "Nombre Apellidos" string (e.g.
// PractitionerOption.label) but need firstName/lastName separately to feed
// InitialsAvatar — split on the first space to reconstruct that shape.
export function splitName(name: string): { firstName: string; lastName: string } {
  const [firstName, ...rest] = name.split(" ");
  return { firstName, lastName: rest.join(" ") || firstName };
}
