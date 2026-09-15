"use client";

import { useState } from "react";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PatientForm } from "@/components/patients/patient-form";
import { updatePatientAction } from "@/lib/actions/patients";
import type { InsuranceOption } from "@/lib/insurance";
import type { PractitionerOption } from "@/lib/practitioners";
import type { Patient } from "@/lib/types";

interface EditPatientDialogProps {
  patient: Patient;
  insuranceOptions?: InsuranceOption[];
  practitionerOptions?: PractitionerOption[] | null;
}

export function EditPatientDialog({
  patient,
  insuranceOptions,
  practitionerOptions,
}: EditPatientDialogProps) {
  const [open, setOpen] = useState(false);
  const boundAction = updatePatientAction.bind(null, patient.id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PencilIcon data-icon="inline-start" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar paciente</DialogTitle>
        </DialogHeader>
        <PatientForm
          action={boundAction}
          initialValues={patient}
          submitLabel="Guardar cambios"
          onSuccess={() => setOpen(false)}
          insuranceOptions={insuranceOptions}
          practitionerOptions={practitionerOptions}
        />
      </DialogContent>
    </Dialog>
  );
}
