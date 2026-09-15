"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PatientForm } from "@/components/patients/patient-form";
import { createPatientAction } from "@/lib/actions/patients";
import type { InsuranceOption } from "@/lib/insurance";
import type { PractitionerOption } from "@/lib/practitioners";

interface CreatePatientDialogProps {
  insuranceOptions?: InsuranceOption[];
  practitionerOptions?: PractitionerOption[] | null;
}

export function CreatePatientDialog({
  insuranceOptions,
  practitionerOptions,
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo paciente</DialogTitle>
        </DialogHeader>
        <PatientForm
          action={createPatientAction}
          submitLabel="Crear paciente"
          submitIcon={<PlusIcon data-icon="inline-start" />}
          onSuccess={() => setOpen(false)}
          insuranceOptions={insuranceOptions}
          practitionerOptions={practitionerOptions}
        />
      </DialogContent>
    </Dialog>
  );
}
