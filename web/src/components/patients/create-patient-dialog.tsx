"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PatientForm } from "@/components/patients/patient-form";
import { createPatientAction } from "@/lib/actions/patients";

export function CreatePatientDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Nuevo paciente</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo paciente</DialogTitle>
        </DialogHeader>
        <PatientForm action={createPatientAction} submitLabel="Crear paciente" onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
