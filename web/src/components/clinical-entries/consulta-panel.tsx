"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { RichTextContent } from "@/components/ui/rich-text-content";
import { AttachmentsPanel } from "@/components/clinical-entries/attachments-panel";
import { ClinicalEntryForm } from "@/components/clinical-entries/clinical-entry-form";
import { DeleteClinicalEntryButton } from "@/components/clinical-entries/delete-clinical-entry-button";
import { getReferringDoctorSuggestions, updateClinicalEntryAction } from "@/lib/actions/clinical-entries";
import {
  FIELD_KIND,
  fieldLabel,
  visibleFields,
  type ConsultationField,
  type ConsultationTemplate,
} from "@/lib/consultation-template";
import type { ClinicalEntry } from "@/lib/types";
import { confirmDiscardUnsavedChanges, useUnsavedChangesWarning } from "@/lib/unsaved-changes";
import { cn } from "@/lib/utils";

// Panel lateral de la ficha para ver y editar una consulta sin salir de la
// ficha (a petición de los médicos: les resulta más natural que una página
// por consulta). La consulta abierta vive en la URL (?consulta=<id>) para que
// recargar, el botón atrás y compartir el enlace sigan funcionando; se cambia
// con history.pushState, que Next integra con useSearchParams sin volver a
// pedir la página al servidor. Los datos salen del listado que la ficha ya
// trae (todos los campos, doctor y nº de adjuntos), así que abrir es inmediato.
// Solo consultas firmadas: los borradores siguen en su página, con su
// autoguardado contra el servidor. La página de la consulta se mantiene para
// enlaces directos e impresión.

export const CONSULTA_PARAM = "consulta";

// Campos con su propio PDF imprimible (rutas hermanas de la página de la consulta).
const PRINTABLE: Partial<Record<ConsultationField, string>> = {
  treatment: "treatment-pdf",
  report: "report-pdf",
};

interface ConsultaPanelContextValue {
  openId: string | null;
  open: (entryId: string) => void;
}

const ConsultaPanelContext = createContext<ConsultaPanelContextValue | null>(null);

function urlWithConsulta(entryId: string | null): string {
  const url = new URL(window.location.href);
  if (entryId) url.searchParams.set(CONSULTA_PARAM, entryId);
  else url.searchParams.delete(CONSULTA_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
}

interface ConsultaWorkspaceProps {
  patientId: string;
  // Consultas de la página actual del listado, en su orden (más reciente
  // primero). Los borradores se ignoran: no se abren en el panel.
  entries: ClinicalEntry[];
  template: ConsultationTemplate;
  enabledFields: ConsultationField[];
  canEdit: boolean;
  canDelete: boolean;
  // La ficha completa: queda a la izquierda del panel (al lado, no debajo)
  // en pantallas anchas.
  children: ReactNode;
}

export function ConsultaWorkspace({
  patientId,
  entries,
  template,
  enabledFields,
  canEdit,
  canDelete,
  children,
}: ConsultaWorkspaceProps) {
  const searchParams = useSearchParams();
  const openId = searchParams.get(CONSULTA_PARAM);
  // Edición en curso con cambios: cerrar o cambiar de consulta pide
  // confirmación, como el resto de formularios.
  const dirtyRef = useRef(false);

  const navigate = useCallback((entryId: string | null) => {
    if (!confirmDiscardUnsavedChanges(dirtyRef.current)) return;
    dirtyRef.current = false;
    window.history.pushState(null, "", urlWithConsulta(entryId));
  }, []);

  const open = useCallback((entryId: string) => navigate(entryId), [navigate]);
  const close = useCallback(() => navigate(null), [navigate]);

  // Con el panel al lado (xl+) la ficha se queda con la mitad del ancho y se
  // apila en una columna, así que la tabla de Consultas baja mucho: se lleva
  // la fila abierta a la vista para no perder el sitio (también al pasar a
  // la anterior/siguiente desde el panel).
  useEffect(() => {
    if (!openId || !window.matchMedia("(min-width: 80rem)").matches) return;
    const link = document.querySelector<HTMLElement>(`[data-consulta-link="${CSS.escape(openId)}"]`);
    link?.closest("tr")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [openId]);

  const signed = entries.filter((e) => e.status !== "borrador");
  const index = openId ? signed.findIndex((e) => e.id === openId) : -1;
  const entry = index >= 0 ? signed[index] : null;
  const isOpen = openId !== null;

  return (
    <ConsultaPanelContext.Provider value={{ openId, open }}>
      <div className={cn(isOpen && "xl:flex xl:items-start xl:gap-4")}>
        <div className="@container/ficha min-w-0 flex-1">{children}</div>
        {isOpen && (
          <>
            {/* Por debajo de xl no hay sitio para tenerlo al lado: se superpone
                a la ficha, con fondo para cerrarlo con un clic fuera. */}
            <div className="fixed inset-0 z-40 bg-black/40 xl:hidden" aria-hidden onClick={close} />
            <aside
              aria-label="Consulta"
              className={cn(
                "fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-background shadow-xl sm:max-w-2xl",
                "xl:sticky xl:top-6 xl:z-auto xl:h-[calc(100vh-3rem)] xl:w-1/2 xl:max-w-none xl:shrink-0 xl:rounded-xl xl:border xl:shadow-none",
              )}
            >
              {entry ? (
                <ConsultaPanelBody
                  // Remontar al cambiar de consulta: sale del modo edición y
                  // vuelve arriba del todo.
                  key={entry.id}
                  patientId={patientId}
                  entry={entry}
                  template={template}
                  enabledFields={enabledFields}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  newer={index > 0 ? signed[index - 1] : null}
                  older={index < signed.length - 1 ? signed[index + 1] : null}
                  onNavigate={open}
                  onClose={close}
                  dirtyRef={dirtyRef}
                />
              ) : (
                <MissingEntry patientId={patientId} entryId={openId} onClose={close} />
              )}
            </aside>
          </>
        )}
      </div>
    </ConsultaPanelContext.Provider>
  );
}

// Enlace de la tabla de Consultas: un clic normal abre el panel; Ctrl/Cmd+clic,
// clic central o "abrir en pestaña nueva" siguen yendo a la página de la
// consulta, como antes.
export function OpenConsultaLink({
  patientId,
  entryId,
  className,
  children,
  ...rest
}: Omit<ComponentProps<"a">, "href" | "onClick" | "ref"> & {
  patientId: string;
  entryId: string;
  children: ReactNode;
}) {
  const ctx = useContext(ConsultaPanelContext);
  const isCurrent = ctx?.openId === entryId;

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!ctx || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!isCurrent) ctx.open(entryId);
  }

  return (
    <Link
      {...rest}
      href={`/patients/${patientId}/clinical-entries/${entryId}`}
      onClick={handleClick}
      aria-current={isCurrent ? "true" : undefined}
      data-consulta-link={entryId}
      className={className}
    >
      {children}
    </Link>
  );
}

function MissingEntry({
  patientId,
  entryId,
  onClose,
}: {
  patientId: string;
  entryId: string | null;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Consulta</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Cerrar" onClick={onClose}>
          <XMarkIcon />
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Esta consulta no está en la página actual del listado.</p>
      {entryId && (
        <Button asChild variant="outline" className="w-fit">
          <Link href={`/patients/${patientId}/clinical-entries/${entryId}`}>Abrir la consulta</Link>
        </Button>
      )}
    </div>
  );
}

function ConsultaPanelBody({
  patientId,
  entry,
  template,
  enabledFields,
  canEdit,
  canDelete,
  newer,
  older,
  onNavigate,
  onClose,
  dirtyRef,
}: {
  patientId: string;
  entry: ClinicalEntry;
  template: ConsultationTemplate;
  enabledFields: ConsultationField[];
  canEdit: boolean;
  canDelete: boolean;
  newer: ClinicalEntry | null;
  older: ClinicalEntry | null;
  onNavigate: (entryId: string) => void;
  onClose: () => void;
  dirtyRef: { current: boolean };
}) {
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useUnsavedChangesWarning(editing && dirty);

  useEffect(() => {
    dirtyRef.current = editing && dirty;
  }, [editing, dirty, dirtyRef]);

  // Foco al título al abrir o cambiar de consulta, para lectores de pantalla y
  // para que Escape funcione sin tener que hacer clic dentro.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector("[role=dialog]")) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const fields = visibleFields(template, entry, enabledFields);

  function startEditing() {
    setEditing(true);
    if (fields.includes("referringDoctor")) {
      void getReferringDoctorSuggestions().then(setSuggestions);
    }
  }

  function stopEditing() {
    setEditing(false);
    setDirty(false);
    dirtyRef.current = false;
  }

  function cancelEditing() {
    if (!confirmDiscardUnsavedChanges(dirty)) return;
    stopEditing();
  }

  const doctor = entry.authorName ? `${entry.authorHonorific ?? "Dr."} ${entry.authorName}` : null;
  const pageHref = `/patients/${patientId}/clinical-entries/${entry.id}`;

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 ref={headingRef} tabIndex={-1} className="text-lg leading-tight font-semibold outline-none">
            {formatDateTime(entry.visitDate)}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {doctor ? <span className="font-medium text-foreground">{doctor}</span> : "Doctor no indicado"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Consulta más reciente"
            title="Consulta más reciente"
            disabled={!newer}
            onClick={() => newer && onNavigate(newer.id)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Consulta anterior"
            title="Consulta anterior"
            disabled={!older}
            onClick={() => older && onNavigate(older.id)}
          >
            <ChevronRightIcon />
          </Button>
          <Button asChild variant="ghost" size="icon-sm" aria-label="Abrir en página completa" title="Abrir en página completa">
            <Link href={pageHref}>
              <ArrowTopRightOnSquareIcon />
            </Link>
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Cerrar" title="Cerrar" onClick={onClose}>
            <XMarkIcon />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {editing ? (
          // Cualquier tecleo o cambio dentro del formulario lo marca como
          // modificado (el editor de texto enriquecido también emite "input").
          <div onInputCapture={() => setDirty(true)} onChangeCapture={() => setDirty(true)}>
            <ClinicalEntryForm
              template={template}
              enabledFields={enabledFields}
              referringDoctorSuggestions={suggestions}
              action={updateClinicalEntryAction.bind(null, patientId, entry.id)}
              initialValues={entry}
              submitLabel="Guardar cambios"
              onSuccess={stopEditing}
              onCancel={cancelEditing}
              draftKey={`clinical-entry-draft:edit:${entry.id}`}
              attachmentsPatientId={patientId}
              fullWidth
            />
          </div>
        ) : (
          <div className="space-y-5">
            {(canEdit || canDelete) && (
              <div className="flex flex-wrap gap-2">
                {canEdit && (
                  <Button variant="outline" size="sm" onClick={startEditing}>
                    <PencilIcon data-icon="inline-start" />
                    Editar
                  </Button>
                )}
                {canDelete && <DeleteClinicalEntryButton patientId={patientId} entryId={entry.id} />}
              </div>
            )}
            {/* Mismos campos que la página de la consulta: los de la plantilla
                de la clínica, en su orden; el primero sale siempre y el resto
                solo si tiene texto. */}
            {fields
              .filter((field) => field === "chiefComplaint" || !!entry[field])
              .map((field) => {
                const printHref = PRINTABLE[field];
                return (
                  <section key={field} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">{fieldLabel(template, field)}</h3>
                      {printHref && (
                        <Button asChild size="sm" variant="ghost">
                          <a href={`${pageHref}/${printHref}`} target="_blank" rel="noopener noreferrer">
                            <ArrowDownTrayIcon data-icon="inline-start" />
                            Imprimir
                          </a>
                        </Button>
                      )}
                    </div>
                    {FIELD_KIND[field] === "rich" ? (
                      <RichTextContent html={entry[field] ?? ""} />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{entry[field]}</p>
                    )}
                  </section>
                );
              })}
            <AttachmentsPanel patientId={patientId} entryId={entry.id} canManage={false} />
          </div>
        )}
      </div>
    </>
  );
}
