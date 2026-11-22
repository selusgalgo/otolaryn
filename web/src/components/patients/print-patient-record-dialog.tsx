"use client";

import { useState } from "react";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
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

// Mismos identificadores que PATIENT_RECORD_SECTIONS en
// src/pdf/patient-record-pdf.util.ts (backend) — mantener ambos iguales.
const SECTIONS = [
  { id: "datos", label: "Datos del paciente" },
  { id: "alergias", label: "Alergias y medicación" },
  { id: "antecedentesPersonales", label: "Antecedentes personales" },
  { id: "antecedentesFamiliares", label: "Antecedentes familiares" },
  { id: "historia", label: "Historia clínica" },
  { id: "consultas", label: "Consultas" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

// "Imprimir" de la ficha: antes de generar el PDF se eligen los bloques que
// se quieren incluir (todos marcados de inicio). El PDF se abre en otra
// pestaña, como hacía el enlace directo.
export function PrintPatientRecordDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<SectionId>>(() => new Set(SECTIONS.map((s) => s.id)));

  function toggle(id: SectionId, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // En el orden del PDF, no en el de los clics.
  const sections = SECTIONS.filter((s) => selected.has(s.id)).map((s) => s.id);
  const href = `/patients/${patientId}/pdf?sections=${sections.join(",")}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setSelected(new Set(SECTIONS.map((s) => s.id)));
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <ArrowDownTrayIcon data-icon="inline-start" />
          Imprimir
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Imprimir ficha</DialogTitle>
          <DialogDescription>Elige qué quieres incluir en el PDF.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {SECTIONS.map((section) => (
            <div key={section.id} className="flex items-center gap-2">
              <Checkbox
                id={`print-${section.id}`}
                checked={selected.has(section.id)}
                onCheckedChange={(checked) => toggle(section.id, checked === true)}
              />
              <label htmlFor={`print-${section.id}`} className="text-sm">
                {section.label}
              </label>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          {sections.length === 0 ? (
            <Button disabled>Generar PDF</Button>
          ) : (
            <Button asChild>
              <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                Generar PDF
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
