"use client";

import { useActionState, useEffect, useState } from "react";
import { PencilIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RichTextContent } from "@/components/ui/rich-text-content";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { updatePatientNotesAction, type PatientFormState } from "@/lib/actions/patients";

interface PatientNotesCardProps {
  patientId: string;
  notes: string | null;
}

const initialState: PatientFormState = {};

export function PatientNotesCard({ patientId, notes }: PatientNotesCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const boundUpdate = updatePatientNotesAction.bind(null, patientId);
  const [state, formAction, pending] = useActionState(boundUpdate, initialState);

  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state.success]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Notas</CardTitle>
        {!editing && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDraft(notes ?? "");
              setEditing(true);
            }}
          >
            <PencilIcon data-icon="inline-start" />
            Editar
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="notes" value={draft} />
            <RichTextEditor value={draft} onChange={setDraft} disabled={pending} />
            {state.error && <p className="text-sm text-destructive">{state.error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Guardando..." : "Guardar"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditing(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <RichTextContent html={notes} emptyText="Sin notas." />
        )}
      </CardContent>
    </Card>
  );
}
