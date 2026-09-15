"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArchiveIcon, EyeIcon, MoreVerticalIcon, PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PatientForm } from "@/components/patients/patient-form";
import { archivePatientAction, updatePatientAction } from "@/lib/actions/patients";
import type { InsuranceOption } from "@/lib/insurance";
import type { PractitionerOption } from "@/lib/practitioners";
import type { Patient } from "@/lib/types";

interface PatientRowActionsProps {
  patient: Patient;
  canArchive: boolean;
  insuranceOptions?: InsuranceOption[];
  practitionerOptions?: PractitionerOption[] | null;
}

// Both dialogs live outside DropdownMenuContent (as siblings, not nested
// inside it) specifically so each keeps its own open state independent of
// the menu — the menu is free to close normally on select (no onSelect
// preventDefault: that call tells Radix to keep the *menu* open, which is
// not what's wanted here and previously left it stuck open) while the
// dialog it triggered stays open on top.
export function PatientRowActions({
  patient,
  canArchive,
  insuranceOptions,
  practitionerOptions,
}: PatientRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const boundUpdate = updatePatientAction.bind(null, patient.id);
  const fullName = `${patient.firstName} ${patient.lastName}`;

  function confirmArchive() {
    setError(null);
    startTransition(async () => {
      const state = await archivePatientAction(patient.id);
      if (state.error) {
        setError(state.error);
        return;
      }
      setArchiveOpen(false);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Acciones para ${fullName}`}>
            <MoreVerticalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/patients/${patient.id}`}>
              <EyeIcon data-icon="inline-start" />
              Ver
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <PencilIcon data-icon="inline-start" />
            Editar
          </DropdownMenuItem>
          {canArchive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
                onSelect={() => setArchiveOpen(true)}
              >
                <ArchiveIcon data-icon="inline-start" />
                Archivar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar paciente</DialogTitle>
          </DialogHeader>
          <PatientForm
            action={boundUpdate}
            initialValues={patient}
            submitLabel="Guardar cambios"
            onSuccess={() => setEditOpen(false)}
            insuranceOptions={insuranceOptions}
            practitionerOptions={practitionerOptions}
          />
        </DialogContent>
      </Dialog>

      {canArchive && (
        <Dialog
          open={archiveOpen}
          onOpenChange={(next) => {
            setArchiveOpen(next);
            if (!next) setError(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Archivar a {fullName}?</DialogTitle>
              <DialogDescription>
                Dejará de aparecer en listados y búsquedas, pero su historial no se elimina — se conserva, como exige
                mantener los datos clínicos durante al menos 5 años.
              </DialogDescription>
            </DialogHeader>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setArchiveOpen(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button variant="destructive" disabled={pending} onClick={confirmArchive}>
                {pending ? "Archivando..." : "Archivar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
