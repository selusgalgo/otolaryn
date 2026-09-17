import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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

// Documento is optional — null for a patient that never had one. Rows
// imported before that placeholder scheme was retired can still carry a
// "SIN-DOC-982e4abe"-shaped value (see the old generatePlaceholderDocumentId
// in patients-csv.util.ts); both read the same as "no documento" here, so
// anywhere the app displays documentId to a person, render it through this
// instead of the raw value.
export function formatDocumentId(documentId: string | null): string {
  return documentId && !documentId.startsWith("SIN-DOC-") ? documentId : "-";
}
