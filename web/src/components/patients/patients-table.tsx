"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronDownIcon,
  ChevronUpDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { PatientRowActions } from "@/components/patients/patient-row-actions";
import { bulkDeletePatientsAction } from "@/lib/actions/patients";
import type { InsuranceOption } from "@/lib/insurance";
import type { PractitionerOption } from "@/lib/practitioners";
import type { Patient } from "@/lib/types";
import { formatDateShort, formatDocumentId } from "@/lib/utils";

type PatientSortBy = "name" | "dateOfBirth";
type SortDirection = "asc" | "desc";

interface PatientsTableProps {
  patients: Patient[];
  emptyMessage: string;
  // recepcion can't archive (see the comment where this table is called) —
  // hides both the bulk "Dar de baja" path and the row menu's "Archivar",
  // since the checkboxes/selection UI exists only to feed that action.
  canArchive: boolean;
  insuranceOptions?: InsuranceOption[];
  practitionerOptions?: PractitionerOption[] | null;
  // Current sort + search, mirrored from the URL by the page above — used
  // only to build each sortable header's href and pick its chevron icon,
  // never to re-sort `patients` client-side (the server already returned
  // them in the requested order).
  search?: string;
  sortBy?: PatientSortBy;
  sortDir?: SortDirection;
}

// Nombre/Fecha de nacimiento headers: chevron-up-down when this column
// isn't the active sort, chevron-up/down once it is — clicking always goes
// to page 1 (a different order can't assume the same page still makes
// sense) and flips direction if this column is already active, otherwise
// starts ascending.
function SortableHeader({
  label,
  column,
  search,
  sortBy,
  sortDir,
}: {
  label: string;
  column: PatientSortBy;
  search?: string;
  sortBy?: PatientSortBy;
  sortDir: SortDirection;
}) {
  const active = sortBy === column;
  const nextDir: SortDirection = active && sortDir === "asc" ? "desc" : "asc";
  const Icon = !active ? ChevronUpDownIcon : sortDir === "asc" ? ChevronUpIcon : ChevronDownIcon;

  const href = new URLSearchParams();
  if (search) href.set("search", search);
  href.set("sortBy", column);
  href.set("sortDir", nextDir);

  return (
    <Link href={`/patients?${href.toString()}`} className="inline-flex items-center gap-1 hover:text-foreground">
      {label}
      <Icon className="size-4" />
    </Link>
  );
}

// Selection lives entirely in this Client Component's own state — the page
// around it stays a Server Component. Give this a `key` tied to whatever
// changes the visible rows (page number, search term) from the parent, so
// navigating resets the selection instead of leaving stale ids selected
// against a different set of rows.
export function PatientsTable({
  patients,
  emptyMessage,
  canArchive,
  insuranceOptions,
  practitionerOptions,
  search,
  sortBy,
  sortDir = "asc",
}: PatientsTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ deleted: number; skipped: number } | null>(null);

  const allSelected = patients.length > 0 && patients.every((p) => selected.has(p.id));
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(patients.map((p) => p.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function confirmBulkDelete() {
    setError(null);
    startTransition(async () => {
      const ids = Array.from(selected);
      const state = await bulkDeletePatientsAction(ids);
      if (state.error) {
        setError(state.error);
        return;
      }
      if (state.result) {
        setResult({ deleted: state.result.deleted, skipped: state.result.skipped.length });
        setSelected(new Set());
        setConfirmOpen(false);
      }
    });
  }

  const selectedCount = selected.size;

  return (
    <div className="space-y-3">
      {canArchive && selectedCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span>
            {selectedCount} paciente{selectedCount === 1 ? "" : "s"} seleccionado{selectedCount === 1 ? "" : "s"}
          </span>
          <Dialog
            open={confirmOpen}
            onOpenChange={(next) => {
              setConfirmOpen(next);
              if (!next) setError(null);
            }}
          >
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm">
                Dar de baja
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  ¿Dar de baja a {selectedCount} paciente{selectedCount === 1 ? "" : "s"}?
                </DialogTitle>
                <DialogDescription>
                  Dejarán de aparecer en listados y búsquedas, pero su historial no se elimina.
                </DialogDescription>
              </DialogHeader>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>
                  Cancelar
                </Button>
                <Button variant="destructive" disabled={pending} onClick={confirmBulkDelete}>
                  {pending ? "Dando de baja..." : "Confirmar baja"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {result && (
        <p className="text-sm text-muted-foreground">
          {result.deleted} paciente{result.deleted === 1 ? "" : "s"} dado{result.deleted === 1 ? "" : "s"} de baja.
          {result.skipped > 0 &&
            ` ${result.skipped} no se ${result.skipped === 1 ? "pudo" : "pudieron"} dar de baja.`}
        </p>
      )}

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              {canArchive && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                    disabled={patients.length === 0}
                    aria-label="Seleccionar todos los pacientes de esta página"
                  />
                </TableHead>
              )}
              <TableHead>
                <SortableHeader label="Nombre" column="name" search={search} sortBy={sortBy} sortDir={sortDir} />
              </TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>
                <SortableHeader
                  label="Fecha de nacimiento"
                  column="dateOfBirth"
                  search={search}
                  sortBy={sortBy}
                  sortDir={sortDir}
                />
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.length === 0 && (
              <TableRow>
                <TableCell colSpan={canArchive ? 6 : 5} className="text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {patients.map((patient) => (
              <TableRow key={patient.id} data-state={selected.has(patient.id) ? "selected" : undefined}>
                {canArchive && (
                  <TableCell>
                    <Checkbox
                      checked={selected.has(patient.id)}
                      onCheckedChange={() => toggleOne(patient.id)}
                      aria-label={`Seleccionar ${patient.firstName} ${patient.lastName}`}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <Link href={`/patients/${patient.id}`} className="group flex items-center gap-3">
                    <InitialsAvatar firstName={patient.firstName} lastName={patient.lastName} size="sm" />
                    <div>
                      <div className="font-medium group-hover:underline">
                        {patient.firstName} {patient.lastName}
                      </div>
                      {/* Nº de historia (legacy_id) — relaciona este paciente
                          con sus filas en pacientes.xls/consultas.xls; el id
                          interno (uuid) no aparece en el legado y no sirve
                          para contrastar nada. Bajo el nombre en vez de en su
                          propia columna. */}
                      <div className="font-mono text-xs text-muted-foreground">
                        {patient.legacyId ?? "—"}
                      </div>
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="font-medium">{formatDocumentId(patient.documentId)}</TableCell>
                <TableCell className="font-medium">{patient.phone}</TableCell>
                <TableCell className="font-medium">{formatDateShort(patient.dateOfBirth)}</TableCell>
                <TableCell>
                  <PatientRowActions
                    patient={patient}
                    canArchive={canArchive}
                    insuranceOptions={insuranceOptions}
                    practitionerOptions={practitionerOptions}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
