"use client";

import { useState, useTransition } from "react";
import {
  ArchiveBoxIcon,
  EyeIcon,
  PencilIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PatientForm } from "@/components/patients/patient-form";
import { RowActions } from "@/components/ui/row-actions";
import { archivePatientAction, updatePatientAction } from "@/lib/actions/patients";
import type { InsuranceOption } from "@/lib/insurance";
import type { Patient } from "@/lib/types";

interface PatientRowActionsProps {
  patient: Patient;
  canArchive: boolean;
  insuranceOptions?: InsuranceOption[];
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
      <RowActions
        overflowLabel={`Más acciones para ${fullName}`}
        actions={[
          { id: "view", label: `Ver a ${fullName}`, icon: <EyeIcon />, href: `/patients/${patient.id}` },
          { id: "edit", label: `Editar a ${fullName}`, icon: <PencilIcon />, onSelect: () => setEditOpen(true) },
          ...(canArchive
            ? [
                {
                  id: "archive",
                  label: `Archivar a ${fullName}`,
                  icon: <ArchiveBoxIcon />,
                  onSelect: () => setArchiveOpen(true),
                  destructive: true,
                },
              ]
            : []),
        ]}
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editar paciente</DialogTitle>
          </DialogHeader>
          {/* Solo esto se desplaza cuando el formulario no cabe entero — el
              título y el borde del diálogo se quedan fijos. */}
          <div className="overflow-y-auto">
            <PatientForm
              action={boundUpdate}
              initialValues={patient}
              submitLabel="Guardar cambios"
              onSuccess={() => setEditOpen(false)}
              insuranceOptions={insuranceOptions}
            />
          </div>
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
