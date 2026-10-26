"use client";

import { useState } from "react";
import { PencilIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ClinicalEntryForm } from "@/components/clinical-entries/clinical-entry-form";
import { updateClinicalEntryAction } from "@/lib/actions/clinical-entries";
import type { ClinicalEntry } from "@/lib/types";

// admin y profesional (el backend ya 403 a recepcion — ver
// ClinicalEntriesController) — a diferencia de Eliminar, que sigue siendo
// solo admin.
export function EditClinicalEntryDialog({ entry }: { entry: ClinicalEntry }) {
  const [open, setOpen] = useState(false);
  const boundAction = updateClinicalEntryAction.bind(null, entry.patientId, entry.id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PencilIcon data-icon="inline-start" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar consulta</DialogTitle>
        </DialogHeader>
        <ClinicalEntryForm
          action={boundAction}
          initialValues={entry}
          submitLabel="Guardar cambios"
          onSuccess={() => setOpen(false)}
          draftKey={`clinical-entry-draft:edit:${entry.id}`}
        />
      </DialogContent>
    </Dialog>
  );
}
