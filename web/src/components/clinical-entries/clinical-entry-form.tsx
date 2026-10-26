"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Textarea } from "@/components/ui/textarea";
import type { ClinicalEntryFormState } from "@/lib/actions/clinical-entries";
import type { ClinicalEntry } from "@/lib/types";

interface ClinicalEntryFormProps {
  action: (prevState: ClinicalEntryFormState, formData: FormData) => Promise<ClinicalEntryFormState>;
  // Presente = modo edición (PATCH, ver EditClinicalEntryDialog); ausente
  // = modo creación, igual que antes.
  initialValues?: ClinicalEntry;
  submitLabel?: string;
  // Llamado tras un guardado correcto — lo usa el diálogo de edición para
  // cerrarse solo, igual que AppointmentForm.
  onSuccess?: () => void;
  // Clave de localStorage para el autoguardado de este formulario en
  // concreto (p.ej. distinta por paciente en alta, por entrada en
  // edición) — sin esto no hay autoguardado. Ver motivación en el comentario
  // de más abajo, junto a DRAFT_TTL_MS.
  draftKey?: string;
}

const initialState: ClinicalEntryFormState = {};

// Un profesional escribiendo una consulta larga puede tardar más de lo que
// dura la sesión (1h) — si caduca a media escritura, la redirección a
// login se lleva por delante todo lo no guardado. Este autoguardado es la
// red de seguridad: cada AUTOSAVE_INTERVAL_MS (y al ocultarse la pestaña)
// se vuelca el formulario entero a localStorage, y si al volver a abrir
// este mismo formulario hay un borrador reciente, se ofrece recuperarlo.
// DRAFT_TTL_MS descarta borradores viejos para no resucitar algo de hace
// semanas que ya no tiene sentido.
const AUTOSAVE_INTERVAL_MS = 15_000;
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
// Un borrador recién dejado (típicamente: la sesión acaba de caducar y la
// persona está volviendo a entrar para seguir) se aplica solo, sin pedir
// confirmación — es lo más práctico, y el riesgo de pisar algo que no
// reconozcan como suyo es mínimo tan reciente. Uno más viejo (otra
// pestaña/dispositivo olvidado, por ejemplo) sí se pregunta primero. Ver
// pendingDraft vs. autoAppliedDraft más abajo.
const AUTO_APPLY_THRESHOLD_MS = 10 * 60 * 1000;
const DRAFT_FIELD_NAMES = [
  "visitDate",
  "chiefComplaint",
  "examinationFindings",
  "diagnosis",
  "treatment",
  "followUpNotes",
] as const;

interface ClinicalEntryDraft {
  savedAt: number;
  fields: Record<string, string>;
}

function readDraft(key: string): ClinicalEntryDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClinicalEntryDraft;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    // Borrador corrupto o localStorage inaccesible (modo privado, cuota
    // llena) — se trata como si no hubiera borrador, nunca como un error
    // que bloquee el formulario.
    return null;
  }
}

function formatDraftTime(savedAt: number): string {
  return new Date(savedAt).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "YYYY-MM-DDTHH:MM" en la hora local del navegador, lo que pide un input
// datetime-local. Con getters locales, no toISOString() (esa es UTC) — así
// la fecha se lee en la hora de pared del profesional, no la del servidor.
function toDateTimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ClinicalEntryForm({
  action,
  initialValues,
  submitLabel = "Guardar entrada",
  onSuccess,
  draftKey,
}: ClinicalEntryFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const visitDateRef = useRef<HTMLInputElement>(null);
  const [chiefComplaint, setChiefComplaint] = useState(initialValues?.chiefComplaint ?? "");
  const [examinationFindings, setExaminationFindings] = useState(
    initialValues?.examinationFindings ?? "",
  );
  const [treatment, setTreatment] = useState(initialValues?.treatment ?? "");
  // Borrador encontrado al montar, pendiente de que la persona decida
  // restaurarlo o descartarlo — null una vez resuelto (en cualquiera de
  // los dos sentidos) o si nunca hubo ninguno. Solo para borradores con
  // más de AUTO_APPLY_THRESHOLD_MS; uno más reciente va directo a
  // autoAppliedDraft sin pasar por aquí.
  const [pendingDraft, setPendingDraft] = useState<ClinicalEntryDraft | null>(null);
  // Borrador ya aplicado solo, sin pedir confirmación — distinto de
  // pendingDraft en que el formulario ya tiene este contenido ahora mismo;
  // "Descartar" aquí significa deshacerlo y volver a initialValues, no
  // simplemente ignorar una oferta.
  const [autoAppliedDraft, setAutoAppliedDraft] = useState<ClinicalEntryDraft | null>(null);

  const saveDraftNow = useCallback(() => {
    if (!draftKey || !formRef.current) return;
    // Solo los campos reales del formulario — FormData también trae los
    // hidden inputs internos de Next ($ACTION_*, que codifican la server
    // action enlazada) y no tiene sentido guardarlos: son específicos de
    // este build/carga de página, no del borrador en sí.
    const data = new FormData(formRef.current);
    const fields: Record<string, string> = {};
    for (const name of DRAFT_FIELD_NAMES) {
      const value = data.get(name);
      if (typeof value === "string") fields[name] = value;
    }
    localStorage.setItem(draftKey, JSON.stringify({ savedAt: Date.now(), fields }));
  }, [draftKey]);

  function applyDraft(draft: ClinicalEntryDraft) {
    const f = draft.fields;
    if (f.chiefComplaint !== undefined) setChiefComplaint(f.chiefComplaint);
    if (f.examinationFindings !== undefined) setExaminationFindings(f.examinationFindings);
    if (f.treatment !== undefined) setTreatment(f.treatment);
    if (f.visitDate !== undefined && visitDateRef.current) visitDateRef.current.value = f.visitDate;
    const form = formRef.current;
    if (form) {
      if (f.diagnosis !== undefined) (form.elements.namedItem("diagnosis") as HTMLTextAreaElement).value = f.diagnosis;
      if (f.followUpNotes !== undefined) {
        (form.elements.namedItem("followUpNotes") as HTMLTextAreaElement).value = f.followUpNotes;
      }
    }
  }

  function resetToInitialValues() {
    setChiefComplaint(initialValues?.chiefComplaint ?? "");
    setExaminationFindings(initialValues?.examinationFindings ?? "");
    setTreatment(initialValues?.treatment ?? "");
    const form = formRef.current;
    if (form) {
      (form.elements.namedItem("diagnosis") as HTMLTextAreaElement).value = initialValues?.diagnosis ?? "";
      (form.elements.namedItem("followUpNotes") as HTMLTextAreaElement).value = initialValues?.followUpNotes ?? "";
    }
    if (visitDateRef.current) {
      visitDateRef.current.value = toDateTimeInputValue(
        initialValues ? new Date(initialValues.visitDate) : new Date(),
      );
    }
  }

  function acceptPendingDraft() {
    if (pendingDraft) applyDraft(pendingDraft);
    setPendingDraft(null);
  }

  function discardPendingDraft() {
    if (draftKey) localStorage.removeItem(draftKey);
    setPendingDraft(null);
  }

  function discardAutoApplied() {
    if (draftKey) localStorage.removeItem(draftKey);
    resetToInitialValues();
    setAutoAppliedDraft(null);
  }

  useEffect(() => {
    if (state.success) {
      if (draftKey) localStorage.removeItem(draftKey);
      onSuccess?.();
    }
  }, [state.success, onSuccess, draftKey]);

  // La sesión acaba de caducar justo al intentar guardar — el texto ya
  // está en el formulario (nunca se pierde solo por este error, ver
  // clinicalEntryErrorState), pero por si la persona cierra la pestaña en
  // vez de volver a entrar enseguida, se fuerza un volcado inmediato aquí
  // en vez de esperar al siguiente tick del intervalo.
  useEffect(() => {
    if (state.sessionExpired) saveDraftNow();
  }, [state.sessionExpired, saveDraftNow]);

  // Solo se mira una vez, al montar — no en cada cambio de draftKey, que
  // no debería cambiar durante la vida de un mismo formulario abierto.
  useEffect(() => {
    if (!draftKey) return;
    const draft = readDraft(draftKey);
    if (!draft) return;
    if (Date.now() - draft.savedAt < AUTO_APPLY_THRESHOLD_MS) {
      applyDraft(draft);
      setAutoAppliedDraft(draft);
    } else {
      setPendingDraft(draft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draftKey) return;
    const interval = setInterval(saveDraftNow, AUTOSAVE_INTERVAL_MS);
    // Además del intervalo, un volcado inmediato al ocultarse la pestaña
    // (cambiar de app, cerrarla) — el caso más probable de perder lo
    // escrito desde el último autoguardado periódico.
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") saveDraftNow();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [draftKey, saveDraftNow]);

  // Set imperatively after mount, not via defaultValue: both "now" and
  // the clinic-local reading of initialValues.visitDate only mean
  // anything in the browser's own clock/timezone, so neither can be
  // computed during the server render without risking a hydration
  // mismatch against whatever the client then computes a moment later.
  useEffect(() => {
    if (visitDateRef.current && !visitDateRef.current.value) {
      visitDateRef.current.value = toDateTimeInputValue(
        initialValues ? new Date(initialValues.visitDate) : new Date(),
      );
    }
  }, [initialValues]);

  return (
    <form ref={formRef} action={formAction} className="grid max-w-2xl gap-4">
      {autoAppliedDraft && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm">
          <span>
            Se recuperó tu borrador autoguardado de las {formatDraftTime(autoAppliedDraft.savedAt)} — puedes
            seguir editándolo.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={discardAutoApplied}>
            Descartar y empezar de nuevo
          </Button>
        </div>
      )}
      {pendingDraft && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm">
          <span>Hay un borrador autoguardado de las {formatDraftTime(pendingDraft.savedAt)}.</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={discardPendingDraft}>
              Descartar
            </Button>
            <Button type="button" size="sm" onClick={acceptPendingDraft}>
              Restaurar
            </Button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="visitDate">Fecha de la consulta</Label>
        <Input id="visitDate" name="visitDate" type="datetime-local" ref={visitDateRef} disabled={pending} />
        <p className="text-xs text-muted-foreground">
          Se rellena con la fecha y hora actuales — edítala si la consulta fue en otro momento.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Motivo de consulta</Label>
        <input type="hidden" name="chiefComplaint" value={chiefComplaint} />
        <RichTextEditor value={chiefComplaint} onChange={setChiefComplaint} disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label>Exploración</Label>
        <input type="hidden" name="examinationFindings" value={examinationFindings} />
        <RichTextEditor value={examinationFindings} onChange={setExaminationFindings} disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="diagnosis">Diagnóstico</Label>
        <Textarea
          id="diagnosis"
          name="diagnosis"
          defaultValue={initialValues?.diagnosis ?? ""}
          disabled={pending}
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>Tratamiento</Label>
        <input type="hidden" name="treatment" value={treatment} />
        <RichTextEditor value={treatment} onChange={setTreatment} disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="followUpNotes">Notas de seguimiento</Label>
        <Textarea
          id="followUpNotes"
          name="followUpNotes"
          defaultValue={initialValues?.followUpNotes ?? ""}
          disabled={pending}
          rows={2}
        />
      </div>
      {state.sessionExpired ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
          <span className="text-destructive">{state.error}</span>
          <Button type="button" size="sm" asChild>
            <a href={`/login?redirect=${encodeURIComponent(pathname)}`}>Iniciar sesión y seguir editando</a>
          </Button>
        </div>
      ) : (
        state.error && <p className="text-sm text-destructive">{state.error}</p>
      )}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Guardando..." : submitLabel}
      </Button>
    </form>
  );
}
