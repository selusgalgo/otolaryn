"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { discardClinicalEntryDraftAction } from "@/lib/actions/clinical-entries";

// Descarta un borrador (borrado real: un borrador no es historia clínica). Lo
// pueden hacer su autor y los administradores. Pide confirmación porque no hay
// vuelta atrás, y al terminar vuelve a la ficha del paciente.
export function DiscardDraftButton({ patientId, draftId }: { patientId: string; draftId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function discard() {
    setError(null);
    startTransition(async () => {
      const result = await discardClinicalEntryDraftAction(patientId, draftId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/patients/${patientId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm">
          <TrashIcon data-icon="inline-start" />
          Descartar borrador
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Descartar este borrador?</DialogTitle>
          <DialogDescription>
            Se borra por completo y no se puede recuperar. Si lo que quieres es conservar la consulta, vuelve y
            pulsa «Guardar entrada».
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Volver
          </Button>
          <Button type="button" variant="destructive" onClick={discard} disabled={pending}>
            {pending ? "Descartando..." : "Descartar borrador"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
