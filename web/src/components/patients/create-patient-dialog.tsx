"use client";

import { useRef, useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PatientForm } from "@/components/patients/patient-form";
import { createPatientAction } from "@/lib/actions/patients";
import type { InsuranceOption } from "@/lib/insurance";
import { confirmDiscardUnsavedChanges } from "@/lib/unsaved-changes";

interface CreatePatientDialogProps {
  insuranceOptions?: InsuranceOption[];
}

export function CreatePatientDialog({
  insuranceOptions,
}: CreatePatientDialogProps) {
  const [open, setOpen] = useState(false);
  const dirtyRef = useRef(false);

  function handleOpenChange(next: boolean) {
    if (!next && !confirmDiscardUnsavedChanges(dirtyRef.current)) return;
    if (!next) dirtyRef.current = false;
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          Nuevo paciente
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nuevo paciente</DialogTitle>
        </DialogHeader>
        {/* Solo esto se desplaza cuando el formulario no cabe entero — el
            título y el borde del diálogo se quedan fijos. */}
        <div className="overflow-y-auto">
          <PatientForm
            action={createPatientAction}
            submitLabel="Crear paciente"
            submitIcon={<PlusIcon data-icon="inline-start" />}
            onDirtyChange={(dirty) => {
              dirtyRef.current = dirty;
            }}
            onSuccess={() => {
              dirtyRef.current = false;
              setOpen(false);
            }}
            insuranceOptions={insuranceOptions}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
