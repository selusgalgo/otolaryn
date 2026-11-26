"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { TenantFormState } from "@/lib/actions/platform";
import {
  ALL_CONSULTATION_FIELDS,
  CONSULTATION_TEMPLATES,
  TEMPLATE_DEFINITIONS,
  fieldLabel,
  type ConsultationField,
  type ConsultationTemplate,
} from "@/lib/consultation-template";
import { keepValuesOnSubmit } from "@/lib/form-submit";

interface ConsultationTemplateFormProps {
  action: (
    prevState: TenantFormState,
    formData: FormData,
  ) => Promise<TenantFormState>;
  initialTemplate: ConsultationTemplate;
  // Campos que la clínica usa ahora (los marcados o los de su plantilla).
  initialFields: ConsultationField[];
}

const initialState: TenantFormState = {};

// Superadmin only — part of setting a clinic up. La plantilla es el punto de
// partida (marca los campos que le corresponden) y cada campo se puede
// marcar o desmarcar para esa clínica. El motivo/enfermedad actual es
// obligatorio en toda consulta, así que siempre está marcado.
export function ConsultationTemplateForm({
  action,
  initialTemplate,
  initialFields,
}: ConsultationTemplateFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [template, setTemplate] =
    useState<ConsultationTemplate>(initialTemplate);
  const [fields, setFields] = useState<Set<ConsultationField>>(
    () => new Set<ConsultationField>([...initialFields, "chiefComplaint"]),
  );

  function changeTemplate(next: ConsultationTemplate) {
    setTemplate(next);
    setFields(new Set(TEMPLATE_DEFINITIONS[next].fields));
  }

  function toggle(field: ConsultationField, checked: boolean) {
    setFields((prev) => {
      const next = new Set(prev);
      if (checked) next.add(field);
      else next.delete(field);
      return next;
    });
  }

  return (
    <form
      onSubmit={keepValuesOnSubmit(formAction)}
      className="grid max-w-md gap-4"
    >
      <div className="space-y-2">
        <Label htmlFor="template">Plantilla</Label>
        <select
          id="template"
          name="template"
          value={template}
          onChange={(e) =>
            changeTemplate(e.target.value as ConsultationTemplate)
          }
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
          Al cambiar de plantilla se marcan los campos que le corresponden;
          después puedes ajustarlos.
        </p>
      </div>
      <fieldset className="space-y-2" disabled={pending}>
        <legend className="text-sm font-medium">Campos de cada consulta</legend>
        {ALL_CONSULTATION_FIELDS.map((field) => {
          const required = field === "chiefComplaint";
          const checked = required || fields.has(field);
          return (
            <div key={field} className="flex items-center gap-2">
              <Checkbox
                id={`field-${field}`}
                checked={checked}
                disabled={required || pending}
                onCheckedChange={(value) => toggle(field, value === true)}
              />
              {checked && <input type="hidden" name="fields" value={field} />}
              <label htmlFor={`field-${field}`} className="text-sm">
                {fieldLabel(template, field)}
                {required && (
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    (obligatorio)
                  </span>
                )}
              </label>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">Adjuntos en todas.</p>
        <p className="text-xs text-muted-foreground">
          Cambiarlo no borra nada: si una consulta ya tiene texto en un campo
          desmarcado, se sigue mostrando.
        </p>
      </fieldset>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-success">Guardado.</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
