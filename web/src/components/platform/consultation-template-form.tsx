"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { TenantFormState } from "@/lib/actions/platform";
import {
  CONSULTATION_TEMPLATES,
  TEMPLATE_DEFINITIONS,
  fieldLabel,
  type ConsultationTemplate,
} from "@/lib/consultation-template";
import { keepValuesOnSubmit } from "@/lib/form-submit";

interface ConsultationTemplateFormProps {
  action: (prevState: TenantFormState, formData: FormData) => Promise<TenantFormState>;
  initialTemplate: ConsultationTemplate;
}

const initialState: TenantFormState = {};

// Superadmin only — part of setting a clinic up. Shows exactly which fields
// the chosen template gives the clinic's consultas, so the choice isn't a
// guess from the name alone.
export function ConsultationTemplateForm({ action, initialTemplate }: ConsultationTemplateFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [template, setTemplate] = useState<ConsultationTemplate>(initialTemplate);

  return (
    <form onSubmit={keepValuesOnSubmit(formAction)} className="grid max-w-md gap-4">
      <div className="space-y-2">
        <Label htmlFor="template">Plantilla</Label>
        <select
          id="template"
          name="template"
          value={template}
          onChange={(e) => setTemplate(e.target.value as ConsultationTemplate)}
          disabled={pending}
          className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
        >
          {CONSULTATION_TEMPLATES.map((t) => (
            <option key={t} value={t}>
              {TEMPLATE_DEFINITIONS[t].name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Campos de cada consulta:{" "}
          {TEMPLATE_DEFINITIONS[template].fields.map((f) => fieldLabel(template, f)).join(", ")}. Adjuntos en
          todas.
        </p>
        <p className="text-xs text-muted-foreground">
          Cambiarla no borra nada: si una consulta ya tiene texto en un campo que la nueva plantilla no usa, se
          sigue mostrando.
        </p>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-success">Guardado.</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
