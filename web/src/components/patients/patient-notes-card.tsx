"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PencilIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RichTextContent } from "@/components/ui/rich-text-content";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  updatePatientNotesAction,
  type PatientFormState,
} from "@/lib/actions/patients";
import { toast } from "sonner";
import {
  confirmDiscardUnsavedChanges,
  useUnsavedChangesWarning,
} from "@/lib/unsaved-changes";

interface PatientNotesCardProps {
  patientId: string;
  notes: string | null;
}

const initialState: PatientFormState = {};

export function PatientNotesCard({ patientId, notes }: PatientNotesCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const draftRef = useRef(draft);
  const isDirty = draft !== (notes ?? "");
  const boundUpdate = updatePatientNotesAction.bind(null, patientId);
  const [state, formAction, pending] = useActionState(
    boundUpdate,
    initialState,
  );
  useUnsavedChangesWarning(editing && isDirty);

  useEffect(() => {
    if (state.success) {
      toast.success("Historia clínica guardada.");
      setEditing(false);
    }
  }, [state]);

  function cancelEditing() {
    if (!confirmDiscardUnsavedChanges(draftRef.current !== (notes ?? "")))
      return;
    setEditing(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Historia clínica</CardTitle>
        {!editing && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              draftRef.current = notes ?? "";
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
            <RichTextEditor
              value={draft}
              onChange={(value) => {
                draftRef.current = value;
                setDraft(value);
              }}
              disabled={pending}
            />
            {state.fieldErrors?.notes && (
              <p className="text-xs text-destructive">
                {state.fieldErrors.notes}
              </p>
            )}
            {state.error && (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Guardando..." : "Guardar"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={cancelEditing}
                disabled={pending}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <RichTextContent
            html={notes}
            emptyText="Sin historia clínica todavía."
          />
        )}
      </CardContent>
    </Card>
  );
}
