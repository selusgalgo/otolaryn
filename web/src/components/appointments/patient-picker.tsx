"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchPatientsAction } from "@/lib/actions/patients";
import { PossibleDuplicateWarning } from "@/components/patients/possible-duplicate-warning";
import { useAppointmentFieldErrors } from "@/components/appointments/appointment-form";
import { formatDocumentId } from "@/lib/utils";
import type { Patient } from "@/lib/types";

type Mode = "existing" | "new";

// Documento y teléfono(s) en una línea bajo el nombre: el teléfono es lo que
// permite distinguir a dos pacientes con nombres parecidos al elegir uno.
function patientContactLine(p: Pick<Patient, "documentId" | "phone" | "phone2">): string {
  const phones = [p.phone, p.phone2].filter(Boolean).join(" / ");
  return [formatDocumentId(p.documentId), phones && `Tel. ${phones}`].filter(Boolean).join(" · ");
}

// Embedded inside the "Nueva cita" form on /appointments/new: a toggle
// between picking an already-registered patient (search-as-you-type) and
// filling in a brand new one inline — for people calling to book their
// very first appointment, who obviously aren't in the system yet. Field
// names for the "new" branch are prefixed with "patient" so they don't
// collide with the appointment's own date/time/notes fields in the same
// <form>; the parent server action reads them by name.
export function PatientPicker() {
  const fieldErrors = useAppointmentFieldErrors();
  const [mode, setMode] = useState<Mode>("existing");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [selected, setSelected] = useState<Patient | null>(null);
  const [searching, setSearching] = useState(false);
  const [newIdentity, setNewIdentity] = useState({ firstName: "", lastName: "", dateOfBirth: "", documentId: "" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patientDisplayName = mode === "existing"
    ? selected ? `${selected.firstName} ${selected.lastName}` : ""
    : `${newIdentity.firstName} ${newIdentity.lastName}`.trim();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || selected) {
      setResults([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      searchPatientsAction(query)
        .then((found) => setResults(found))
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selected]);

  return (
    <div className="space-y-4">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="patientDisplayName" value={patientDisplayName} />
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === "existing" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("existing")}
        >
          Paciente existente
        </Button>
        <Button
          type="button"
          variant={mode === "new" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("new")}
        >
          Paciente nuevo
        </Button>
      </div>

      {mode === "existing" ? (
        <div className="space-y-2">
          <input type="hidden" name="patientId" value={selected?.id ?? ""} />
          {selected ? (
            <div className="flex items-center justify-between rounded-md border p-2 text-sm">
              <span>
                <span className="font-medium">
                  {selected.firstName} {selected.lastName}
                </span>
                <span className="block text-xs text-muted-foreground">{patientContactLine(selected)}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelected(null);
                  setQuery("");
                }}
              >
                Cambiar
              </Button>
            </div>
          ) : (
            <>
              <Label htmlFor="patientSearch">Buscar paciente (nombre, documento o teléfono)</Label>
              <Input
                id="patientSearch"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                placeholder="Empieza a escribir..."
              />
              {searching && <p className="text-xs text-muted-foreground">Buscando...</p>}
              {results.length > 0 && (
                <ul className="divide-y rounded-md border">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setSelected(p);
                          setResults([]);
                        }}
                      >
                        <span className="block font-medium">
                          {p.firstName} {p.lastName}
                        </span>
                        <span className="block text-xs text-muted-foreground">{patientContactLine(p)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!searching && query.trim() && results.length === 0 && (
                <p className="text-xs text-muted-foreground">Sin resultados.</p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-4 rounded-md border p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="patientFirstName">Nombre</Label>
              <Input
                id="patientFirstName"
                name="patientFirstName"
                required
                value={newIdentity.firstName}
                onChange={(event) => setNewIdentity((current) => ({ ...current, firstName: event.target.value }))}
                aria-invalid={!!fieldErrors.patientFirstName}
                aria-describedby={fieldErrors.patientFirstName ? "patientFirstName-error" : undefined}
              />
              {fieldErrors.patientFirstName && <p id="patientFirstName-error" className="text-xs text-destructive">{fieldErrors.patientFirstName}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="patientLastName">Apellidos</Label>
              <Input
                id="patientLastName"
                name="patientLastName"
                required
                value={newIdentity.lastName}
                onChange={(event) => setNewIdentity((current) => ({ ...current, lastName: event.target.value }))}
                aria-invalid={!!fieldErrors.patientLastName}
                aria-describedby={fieldErrors.patientLastName ? "patientLastName-error" : undefined}
              />
              {fieldErrors.patientLastName && <p id="patientLastName-error" className="text-xs text-destructive">{fieldErrors.patientLastName}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="patientDocumentId">Documento (DNI/NIE/pasaporte)</Label>
              <Input
                id="patientDocumentId"
                name="patientDocumentId"
                maxLength={20}
                value={newIdentity.documentId}
                onChange={(event) => setNewIdentity((current) => ({ ...current, documentId: event.target.value }))}
                aria-invalid={!!fieldErrors.patientDocumentId}
                aria-describedby={fieldErrors.patientDocumentId ? "patientDocumentId-error" : undefined}
              />
              {fieldErrors.patientDocumentId && <p id="patientDocumentId-error" className="text-xs text-destructive">{fieldErrors.patientDocumentId}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="patientDateOfBirth">Fecha de nacimiento</Label>
              <Input
                id="patientDateOfBirth"
                name="patientDateOfBirth"
                type="date"
                required
                value={newIdentity.dateOfBirth}
                onChange={(event) => setNewIdentity((current) => ({ ...current, dateOfBirth: event.target.value }))}
                aria-invalid={!!fieldErrors.patientDateOfBirth}
                aria-describedby={fieldErrors.patientDateOfBirth ? "patientDateOfBirth-error" : undefined}
              />
              {fieldErrors.patientDateOfBirth && <p id="patientDateOfBirth-error" className="text-xs text-destructive">{fieldErrors.patientDateOfBirth}</p>}
            </div>
          </div>
          <PossibleDuplicateWarning values={newIdentity} />
          <div className="space-y-2">
            <Label htmlFor="patientPhone">Teléfono</Label>
            <Input id="patientPhone" name="patientPhone" required aria-invalid={!!fieldErrors.patientPhone} aria-describedby={fieldErrors.patientPhone ? "patientPhone-error" : undefined} />
            {fieldErrors.patientPhone && <p id="patientPhone-error" className="text-xs text-destructive">{fieldErrors.patientPhone}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="patientEmail">Email</Label>
            <Input id="patientEmail" name="patientEmail" type="email" aria-invalid={!!fieldErrors.patientEmail} aria-describedby={fieldErrors.patientEmail ? "patientEmail-error" : undefined} />
            {fieldErrors.patientEmail && <p id="patientEmail-error" className="text-xs text-destructive">{fieldErrors.patientEmail}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
