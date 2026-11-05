"use client";

import { AttachmentsPanel } from "@/components/clinical-entries/attachments-panel";
import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDraftScope } from "@/components/layout/draft-scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Textarea } from "@/components/ui/textarea";
import type { ClinicalEntryFormState, DraftSaveResult, DraftValues } from "@/lib/actions/clinical-entries";
import {
  buildDraftKey,
  purgeStaleDrafts,
  readDraft,
  removeDraft,
  writeDraft,
  type StoredDraft,
} from "@/lib/drafts";
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
  // Identifica este formulario en concreto para el autoguardado (p.ej.
  // distinto por paciente en alta, por entrada en edición); la clave final
  // añade clínica y usuario (ver DraftScopeProvider). Sin esto no hay
  // autoguardado. Ver motivación en el comentario de más abajo, junto a
  // DRAFT_TTL_MS.
  draftKey?: string;
  // Paciente al que pertenece la consulta; con él se muestran los archivos
  // adjuntos (en el alta, en el borrador y al editar). Sin él, no hay adjuntos.
  attachmentsPatientId?: string;
  // Borrador guardado en el servidor: aparece en la ficha del paciente con la
  // etiqueta "Borrador" para seguir desde cualquier ordenador (visible solo
  // para su autor y los administradores; se borra a los 10 días sin tocarlo).
  // Solo para altas — editar una consulta ya firmada no lo usa, y sigue con el
  // autoguardado local de arriba. Las acciones llegan por props (ya ligadas al
  // paciente) para no acoplar el formulario a ellas.
  serverDraft?: {
    // Id de un borrador ya existente (página del borrador). En el alta no hay:
    // el primer autoguardado lo crea.
    draftId?: string;
    save: (draftId: string | null, values: DraftValues) => Promise<DraftSaveResult>;
    // Firma el borrador creado mientras se escribía el alta. Mientras no exista
    // borrador se usa `action`, que crea la consulta directamente.
    finalize?: (
      draftId: string,
      prevState: ClinicalEntryFormState,
      formData: FormData,
    ) => Promise<ClinicalEntryFormState>;
  };
}

const initialState: ClinicalEntryFormState = {};

// Un profesional escribiendo una consulta larga puede tardar más de lo que
// dura la sesión (1h) — si caduca a media escritura, la redirección a
// login se lleva por delante todo lo no guardado. Este autoguardado es la
// red de seguridad: cada AUTOSAVE_INTERVAL_MS, al ocultarse la pestaña, al
// irse de la página y al desmontarse el formulario se vuelca el formulario
// entero a localStorage, y si al volver a abrir este mismo formulario hay un
// borrador reciente, se ofrece recuperarlo. DRAFT_TTL_MS descarta
// borradores viejos para no resucitar algo que ya no tiene sentido y para
// no dejar texto clínico más de una jornada en un ordenador compartido.
const AUTOSAVE_INTERVAL_MS = 15_000;
const DRAFT_TTL_MS = 8 * 60 * 60 * 1000;
// Un borrador recién dejado (típicamente: la sesión acaba de caducar y la
// persona está volviendo a entrar para seguir) se aplica solo, sin pedir
// confirmación — es lo más práctico, y el riesgo de pisar algo que no
// reconozcan como suyo es mínimo tan reciente. Uno más viejo (otra
// pestaña/dispositivo olvidado, por ejemplo) sí se pregunta primero. Ver
// pendingDraft vs. autoAppliedDraft más abajo.
const AUTO_APPLY_THRESHOLD_MS = 10 * 60 * 1000;

interface FormValues {
  visitDate: string;
  chiefComplaint: string;
  examinationFindings: string;
  diagnosis: string;
  treatment: string;
  followUpNotes: string;
}

type ClinicalEntryDraft = StoredDraft<Partial<FormValues>>;

const TEXT_FIELDS = ["chiefComplaint", "examinationFindings", "diagnosis", "treatment", "followUpNotes"] as const;

function initialTexts(initialValues?: ClinicalEntry): Omit<FormValues, "visitDate"> {
  return {
    chiefComplaint: initialValues?.chiefComplaint ?? "",
    examinationFindings: initialValues?.examinationFindings ?? "",
    diagnosis: initialValues?.diagnosis ?? "",
    treatment: initialValues?.treatment ?? "",
    followUpNotes: initialValues?.followUpNotes ?? "",
  };
}

const FIELD_ORDER = ["visitDate", ...TEXT_FIELDS] as const;

// Huella de los valores para saber si el servidor ya tiene lo último escrito.
function snapshot(values: FormValues): string {
  return JSON.stringify(FIELD_ORDER.map((name) => values[name]));
}

// El editor de texto enriquecido devuelve "<p></p>" para un campo vacío.
function normalizeText(value: string): string {
  return value === "<p></p>" ? "" : value;
}

// Sin nada escrito que valga la pena guardar (solo la fecha por defecto, o
// lo mismo que ya hay guardado en el servidor): no se crea ni se pisa ningún
// borrador.
function isPristine(values: FormValues, initial: Omit<FormValues, "visitDate">): boolean {
  return TEXT_FIELDS.every((name) => normalizeText(values[name]) === normalizeText(initial[name]));
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
  attachmentsPatientId,
  serverDraft,
}: ClinicalEntryFormProps) {
  // Id del borrador en el servidor: el de la página del borrador, o el que crea
  // el primer autoguardado de un alta. Con él, "Guardar entrada" firma ESE
  // borrador en vez de crear una consulta aparte y dejarlo huérfano.
  const draftIdRef = useRef<string | null>(serverDraft?.draftId ?? null);
  const serverDraftRef = useRef(serverDraft);
  useEffect(() => {
    serverDraftRef.current = serverDraft;
  });
  const submitAction = useCallback(
    async (prevState: ClinicalEntryFormState, formData: FormData) => {
      const id = draftIdRef.current;
      const finalize = serverDraftRef.current?.finalize;
      return id && finalize ? finalize(id, prevState, formData) : action(prevState, formData);
    },
    [action],
  );
  const [state, formAction, pending] = useActionState(submitAction, initialState);
  const pathname = usePathname();
  const router = useRouter();
  const scope = useDraftScope();
  // Sin usuario identificado no hay autoguardado: mejor ninguno que uno cuya
  // clave pueda mezclar a dos personas en el mismo ordenador.
  const storageKey = draftKey && scope ? buildDraftKey(scope, draftKey) : undefined;

  // Todos los campos son controlados. Con campos no controlados (defaultValue)
  // React 19 los vaciaba al terminar la acción de guardado, también cuando
  // fallaba — sesión caducada incluida — y además no se podían leer del
  // FormData mientras el formulario estaba deshabilitado (pending). Con
  // estado propio, ni el reset ni `disabled` pueden perder lo escrito.
  const [values, setValues] = useState<FormValues>(() => ({ visitDate: "", ...initialTexts(initialValues) }));
  const valuesRef = useRef(values);
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);
  const initialRef = useRef(initialTexts(initialValues));

  const setField = useCallback(
    (name: keyof FormValues, value: string) => setValues((v) => ({ ...v, [name]: value })),
    [],
  );

  // Borrador encontrado al montar, pendiente de que la persona decida
  // restaurarlo o descartarlo — null una vez resuelto (en cualquiera de
  // los dos sentidos) o si nunca hubo ninguno. Solo para borradores con
  // más de AUTO_APPLY_THRESHOLD_MS; uno más reciente va directo a
  // autoAppliedDraft sin pasar por aquí.
  const [pendingDraft, setPendingDraft] = useState<ClinicalEntryDraft | null>(null);
  // Mientras haya un borrador pendiente de decidir, el autoguardado NO
  // escribe: el formulario aún está vacío y pisaría justo el borrador que se
  // está ofreciendo (y le renovaría la fecha).
  const pendingDraftRef = useRef(false);
  // Borrador ya aplicado solo, sin pedir confirmación — distinto de
  // pendingDraft en que el formulario ya tiene este contenido ahora mismo;
  // "Descartar" aquí significa deshacerlo y volver a initialValues, no
  // simplemente ignorar una oferta.
  const [autoAppliedDraft, setAutoAppliedDraft] = useState<ClinicalEntryDraft | null>(null);
  // La consulta ya se guardó bien: el borrador sobra y nada debe volver a
  // escribirlo (ni el intervalo ni la limpieza al desmontar).
  const settledRef = useRef(false);
  // No se pudo escribir el borrador (almacenamiento lleno o bloqueado).
  const [draftFailed, setDraftFailed] = useState(false);
  // Sincronización con el borrador del servidor (solo si hay `serverDraft`).
  // lastSyncedRef: huella de lo último que el servidor ya tiene — evita volver a
  // enviarlo y evita duplicarlo en localStorage. syncRef: la petición en vuelo,
  // para no solapar dos y para que "Guardar entrada" espere a que termine.
  const [serverSavedAt, setServerSavedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const lastSyncedRef = useRef<string | null>(null);
  const syncRef = useRef<Promise<void> | null>(null);
  const submittingRef = useRef(false);

  const saveDraftNow = useCallback(() => {
    if (!storageKey || settledRef.current || pendingDraftRef.current) return;
    if (isPristine(valuesRef.current, initialRef.current)) return;
    // Lo que el servidor ya tiene no se duplica en este navegador: texto
    // clínico en claro en localStorage solo mientras haga falta como respaldo.
    if (lastSyncedRef.current === snapshot(valuesRef.current)) return;
    const ok = writeDraft(storageKey, valuesRef.current);
    setDraftFailed(!ok);
  }, [storageKey]);

  const syncToServer = useCallback((): Promise<void> => {
    const sd = serverDraftRef.current;
    if (!sd || settledRef.current || pendingDraftRef.current) return Promise.resolve();
    if (syncRef.current) return syncRef.current;
    const values = valuesRef.current;
    const snap = snapshot(values);
    if (snap === lastSyncedRef.current) return Promise.resolve();
    // Un alta sin borrador todavía no crea uno vacío: espera a que haya algo escrito.
    if (!draftIdRef.current && isPristine(values, initialRef.current)) return Promise.resolve();

    setSavingDraft(true);
    const run = sd
      .save(draftIdRef.current, { ...values })
      .then((res) => {
        if (res.id) {
          draftIdRef.current = res.id;
          lastSyncedRef.current = snap;
          setServerSavedAt(res.savedAt ?? new Date().toISOString());
          setSyncError(null);
          // El servidor ya tiene lo último: sobra la copia local, salvo que se
          // haya seguido escribiendo mientras tanto.
          if (snapshot(valuesRef.current) === snap) removeDraft(storageKey);
        } else {
          setSyncError(
            res.sessionExpired
              ? "Tu sesión ha caducado: lo escrito se conserva en este dispositivo y se subirá al volver a entrar."
              : (res.error ?? "No se pudo guardar el borrador en el servidor."),
          );
        }
      })
      .catch(() => setSyncError("No se pudo guardar el borrador en el servidor."))
      .finally(() => {
        syncRef.current = null;
        setSavingDraft(false);
      });
    syncRef.current = run;
    return run;
  }, [storageKey]);

  // Un archivo necesita una consulta a la que colgarse: en un alta sin borrador
  // todavía se crea ahora (aunque no haya nada escrito) y queda como el borrador
  // que luego firma "Guardar entrada".
  const ensureDraftId = useCallback(async (): Promise<string | null> => {
    if (draftIdRef.current) return draftIdRef.current;
    const sd = serverDraftRef.current;
    if (!sd) return null;
    if (syncRef.current) await syncRef.current;
    if (draftIdRef.current) return draftIdRef.current;
    const res = await sd.save(null, { ...valuesRef.current });
    if (!res.id) return null;
    draftIdRef.current = res.id;
    setServerSavedAt(res.savedAt ?? new Date().toISOString());
    return res.id;
  }, []);

  function applyDraft(draft: ClinicalEntryDraft) {
    setValues((v) => ({ ...v, ...draft.fields }));
  }

  function resetToInitialValues() {
    setValues({
      ...initialTexts(initialValues),
      visitDate: toDateTimeInputValue(initialValues ? new Date(initialValues.visitDate) : new Date()),
    });
  }

  function acceptPendingDraft() {
    if (pendingDraft) applyDraft(pendingDraft);
    pendingDraftRef.current = false;
    setPendingDraft(null);
  }

  function discardPendingDraft() {
    removeDraft(storageKey);
    pendingDraftRef.current = false;
    setPendingDraft(null);
  }

  function discardAutoApplied() {
    removeDraft(storageKey);
    resetToInitialValues();
    setAutoAppliedDraft(null);
  }

  // Resultado de la acción: guardado correcto → fuera el borrador y, en el
  // alta, navegar a la consulta creada (la acción ya no hace redirect, ver
  // ClinicalEntryFormState.redirectTo). Un error deja el formulario tal cual
  // y fuerza un volcado inmediato del borrador por si la persona cierra la
  // pestaña en vez de reintentar.
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    if (state.success || state.redirectTo) {
      settledRef.current = true;
      removeDraft(storageKey);
      if (state.redirectTo) router.push(state.redirectTo);
      else onSuccessRef.current?.();
    } else if (state.error) {
      saveDraftNow();
    }
  }, [state, storageKey, router, saveDraftNow]);

  // Set imperatively after mount, not via initial state: both "now" and
  // the clinic-local reading of initialValues.visitDate only mean
  // anything in the browser's own clock/timezone, so neither can be
  // computed during the server render without risking a hydration
  // mismatch against whatever the client then computes a moment later.
  useEffect(() => {
    const initialDate = toDateTimeInputValue(initialValues ? new Date(initialValues.visitDate) : new Date());
    setValues((v) => (v.visitDate ? v : { ...v, visitDate: initialDate }));
    // En la página de un borrador existente, lo que se acaba de cargar YA está
    // en el servidor: sin esto, abrirlo lo reenviaría y renovaría su caducidad
    // sin que nadie haya escrito nada.
    if (serverDraftRef.current?.draftId && lastSyncedRef.current === null) {
      lastSyncedRef.current = snapshot({ visitDate: initialDate, ...initialTexts(initialValues) });
    }
  }, [initialValues]);

  // Solo se mira una vez, al montar — no en cada cambio de storageKey, que
  // no debería cambiar durante la vida de un mismo formulario abierto.
  useEffect(() => {
    purgeStaleDrafts(DRAFT_TTL_MS);
    if (!storageKey) return;
    const draft = readDraft<Partial<FormValues>>(storageKey, DRAFT_TTL_MS);
    if (!draft) return;
    if (Date.now() - draft.savedAt < AUTO_APPLY_THRESHOLD_MS) {
      applyDraft(draft);
      setAutoAppliedDraft(draft);
    } else {
      pendingDraftRef.current = true;
      setPendingDraft(draft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!storageKey) return;
    // Primero la copia local (síncrona, no puede fallar por red ni por sesión)
    // y después, si hay borrador en el servidor, su sincronización.
    const tick = () => {
      saveDraftNow();
      void syncToServer();
    };
    const interval = setInterval(tick, AUTOSAVE_INTERVAL_MS);
    // Además del intervalo, un volcado inmediato al ocultarse la pestaña o
    // irse de la página (cambiar de app, cerrarla, recargar) y al desmontarse
    // el formulario (navegar por la barra lateral, cerrar el diálogo de
    // edición): los casos más probables de perder lo escrito desde el último
    // autoguardado periódico.
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") tick();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", saveDraftNow);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", saveDraftNow);
      tick();
    };
  }, [storageKey, saveDraftNow, syncToServer]);

  // En vez de <form action={formAction}>: ese prop hace que React vacíe el
  // formulario al terminar, aunque el guardado falle (ver el comentario sobre
  // los campos controlados). Se guarda un borrador justo antes de enviar —
  // si el envío muere por la sesión, la red o el servidor, ya está a salvo.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || submittingRef.current) return;
    submittingRef.current = true;
    // Antes de esperar nada: currentTarget deja de existir tras un await.
    const data = new FormData(event.currentTarget);
    try {
      saveDraftNow();
      // Si el autoguardado está creando el borrador justo ahora, hay que
      // esperar a que termine para firmar ESE borrador y no crear una consulta
      // aparte dejando el borrador huérfano en la ficha.
      if (syncRef.current) await syncRef.current;
      startTransition(() => formAction(data));
    } finally {
      submittingRef.current = false;
    }
  }

  const loginHref = `/session/expired?reason=SESSION_EXPIRED&redirect=${encodeURIComponent(pathname)}`;

  return (
    <form onSubmit={handleSubmit} className="grid max-w-2xl gap-4">
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
      {draftFailed && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          No se puede guardar una copia automática en este dispositivo (almacenamiento lleno o bloqueado). Guarda
          la consulta cuanto antes o copia el texto antes de salir de esta página.
        </p>
      )}
      {serverDraft && (
        <p
          aria-live="polite"
          className={`rounded-lg border px-3 py-2 text-sm ${
            syncError
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-input bg-muted/50 text-muted-foreground"
          }`}
        >
          {syncError ??
            (serverSavedAt
              ? `Borrador guardado a las ${new Date(serverSavedAt).toLocaleTimeString("es-ES", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}. Aparece en la ficha del paciente como «Borrador» y se borra solo a los 10 días si nadie lo toca.`
              : "Mientras escribes se guarda como borrador: aparecerá en la ficha del paciente con la etiqueta «Borrador» para que puedas seguir desde cualquier ordenador.")}
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="visitDate">Fecha de la consulta</Label>
        <Input
          id="visitDate"
          name="visitDate"
          type="datetime-local"
          value={values.visitDate}
          onChange={(e) => setField("visitDate", e.target.value)}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Se rellena con la fecha y hora actuales — edítala si la consulta fue en otro momento.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Motivo de consulta</Label>
        <input type="hidden" name="chiefComplaint" value={values.chiefComplaint} />
        <RichTextEditor
          value={values.chiefComplaint}
          onChange={(html) => setField("chiefComplaint", html)}
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label>Exploración</Label>
        <input type="hidden" name="examinationFindings" value={values.examinationFindings} />
        <RichTextEditor
          value={values.examinationFindings}
          onChange={(html) => setField("examinationFindings", html)}
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="diagnosis">Diagnóstico</Label>
        <Textarea
          id="diagnosis"
          name="diagnosis"
          value={values.diagnosis}
          onChange={(e) => setField("diagnosis", e.target.value)}
          disabled={pending}
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>Tratamiento</Label>
        <input type="hidden" name="treatment" value={values.treatment} />
        <RichTextEditor
          value={values.treatment}
          onChange={(html) => setField("treatment", html)}
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="followUpNotes">Notas de seguimiento</Label>
        <Textarea
          id="followUpNotes"
          name="followUpNotes"
          value={values.followUpNotes}
          onChange={(e) => setField("followUpNotes", e.target.value)}
          disabled={pending}
          rows={2}
        />
      </div>
      {state.sessionExpired ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
          <span className="text-destructive">
            {state.error}{" "}
            {draftFailed
              ? "No se ha podido guardar una copia en este dispositivo: copia el texto antes de salir."
              : "Lo que has escrito está guardado como borrador en este dispositivo."}
          </span>
          <Button type="button" size="sm" asChild>
            <a href={loginHref}>Iniciar sesión y seguir editando</a>
          </Button>
        </div>
      ) : (
        state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )
      )}
      {attachmentsPatientId && (serverDraft || initialValues?.id) && (
        <AttachmentsPanel
          patientId={attachmentsPatientId}
          entryId={serverDraft ? (serverDraft.draftId ?? null) : (initialValues?.id ?? null)}
          ensureEntryId={serverDraft ? ensureDraftId : undefined}
          canManage
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Guardando..." : submitLabel}
        </Button>
        {serverDraft && (
          <Button
            type="button"
            variant="outline"
            disabled={pending || savingDraft}
            onClick={() => {
              saveDraftNow();
              void syncToServer();
            }}
          >
            {savingDraft ? "Guardando borrador..." : "Guardar borrador"}
          </Button>
        )}
      </div>
    </form>
  );
}
