"use client";

import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PatientForm } from "@/components/patients/patient-form";
import { createPatientAction } from "@/lib/actions/patients";
import type { InsuranceOption } from "@/lib/insurance";

interface CreatePatientDialogProps {
  insuranceOptions?: InsuranceOption[];
}

export function CreatePatientDialog({
  insuranceOptions,
}: CreatePatientDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            onSuccess={() => setOpen(false)}
            insuranceOptions={insuranceOptions}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
