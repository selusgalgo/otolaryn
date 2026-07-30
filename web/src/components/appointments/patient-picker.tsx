"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchPatientsAction } from "@/lib/actions/patients";
import type { Patient } from "@/lib/types";

type Mode = "existing" | "new";

// Embedded inside the "Nueva cita" form on /appointments/new: a toggle
// between picking an already-registered patient (search-as-you-type) and
// filling in a brand new one inline — for people calling to book their
// very first appointment, who obviously aren't in the system yet. Field
// names for the "new" branch are prefixed with "patient" so they don't
// collide with the appointment's own date/time/notes fields in the same
// <form>; the parent server action reads them by name.
export function PatientPicker() {
  const [mode, setMode] = useState<Mode>("existing");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [selected, setSelected] = useState<Patient | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
                {selected.firstName} {selected.lastName} · {selected.documentId}
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
              <Label htmlFor="patientSearch">Buscar paciente (nombre o documento)</Label>
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
                        {p.firstName} {p.lastName} · {p.documentId}
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
              <Input id="patientFirstName" name="patientFirstName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="patientLastName">Apellidos</Label>
              <Input id="patientLastName" name="patientLastName" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="patientDocumentId">Documento (DNI/NIE/pasaporte)</Label>
              <Input id="patientDocumentId" name="patientDocumentId" required maxLength={20} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="patientDateOfBirth">Fecha de nacimiento</Label>
              <Input id="patientDateOfBirth" name="patientDateOfBirth" type="date" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="patientPhone">Teléfono</Label>
            <Input id="patientPhone" name="patientPhone" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="patientEmail">Email</Label>
            <Input id="patientEmail" name="patientEmail" type="email" />
          </div>
        </div>
      )}
    </div>
  );
}
