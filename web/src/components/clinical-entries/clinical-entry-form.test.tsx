import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftScopeProvider } from "@/components/layout/draft-scope";
import type { ClinicalEntryFormState } from "@/lib/actions/clinical-entries";
import { buildDraftKey } from "@/lib/drafts";
import { ClinicalEntryForm } from "./clinical-entry-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/patients/p1/clinical-entries/new",
  useRouter: () => ({ push }),
}));
// tiptap no tiene sentido en jsdom: un textarea con el mismo contrato
// (value/onChange) basta para lo que se prueba aquí.
vi.mock("@/components/ui/rich-text-editor", () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const SCOPE = "t1:u1";
const KEY = buildDraftKey(SCOPE, "new:p1");

function renderForm(action: (prev: ClinicalEntryFormState, fd: FormData) => Promise<ClinicalEntryFormState>, scope: string | null = SCOPE) {
  return render(
    <DraftScopeProvider scope={scope}>
      <ClinicalEntryForm action={action} draftKey="new:p1" />
    </DraftScopeProvider>,
  );
}

function fillAll() {
  fireEvent.change(screen.getByLabelText("Diagnóstico"), { target: { value: "Otitis media" } });
  fireEvent.change(screen.getByLabelText("Notas de seguimiento"), { target: { value: "Revisar en 7 días" } });
  fireEvent.change(screen.getByLabelText("Fecha de la consulta"), { target: { value: "2026-11-02T10:30" } });
  fireEvent.change(screen.getAllByLabelText("editor")[0], { target: { value: "Dolor de oído" } });
}

beforeEach(() => push.mockClear());
afterEach(() => vi.useRealTimers());

describe("ClinicalEntryForm", () => {
  it("un guardado fallido (sesión caducada) no vacía ningún campo y conserva el borrador", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Tu sesión ha caducado.", sessionExpired: true });
    renderForm(action);
    fillAll();

    fireEvent.click(screen.getByRole("button", { name: "Guardar entrada" }));
    await waitFor(() => expect(screen.getByText(/Tu sesión ha caducado/)).toBeInTheDocument());

    expect(screen.getByLabelText("Diagnóstico")).toHaveValue("Otitis media");
    expect(screen.getByLabelText("Notas de seguimiento")).toHaveValue("Revisar en 7 días");
    expect(screen.getByLabelText("Fecha de la consulta")).toHaveValue("2026-11-02T10:30");
    const draft = JSON.parse(localStorage.getItem(KEY)!);
    expect(draft.fields).toMatchObject({ diagnosis: "Otitis media", followUpNotes: "Revisar en 7 días", visitDate: "2026-11-02T10:30" });
  });

  it("al crear con éxito borra el borrador y navega a la consulta", async () => {
    const action = vi.fn().mockResolvedValue({ success: true, redirectTo: "/patients/p1/clinical-entries/e1" });
    renderForm(action);
    fillAll();

    fireEvent.click(screen.getByRole("button", { name: "Guardar entrada" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/patients/p1/clinical-entries/e1"));

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("no vuelve a escribir el borrador al desmontar tras guardar con éxito", async () => {
    const action = vi.fn().mockResolvedValue({ success: true, redirectTo: "/x" });
    const { unmount } = renderForm(action);
    fillAll();
    fireEvent.click(screen.getByRole("button", { name: "Guardar entrada" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    unmount();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("guarda lo escrito al desmontarse (navegar por la barra lateral)", () => {
    const { unmount } = renderForm(vi.fn());
    fillAll();
    unmount();
    expect(JSON.parse(localStorage.getItem(KEY)!).fields.diagnosis).toBe("Otitis media");
  });

  it("no crea borrador si no se ha escrito nada", () => {
    const { unmount } = renderForm(vi.fn());
    unmount();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("un borrador antiguo pendiente de decidir no se sobrescribe con el formulario vacío", () => {
    vi.useFakeTimers();
    const old = { savedAt: Date.now() - 60 * 60 * 1000, fields: { diagnosis: "borrador viejo" } };
    localStorage.setItem(KEY, JSON.stringify(old));
    renderForm(vi.fn());

    act(() => {
      vi.advanceTimersByTime(45_000);
    });

    expect(screen.getByText(/Hay un borrador autoguardado/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(old);
  });

  it("un borrador reciente se aplica solo y otro usuario no lo ve", () => {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now() - 60_000, fields: { diagnosis: "de u1" } }));
    const { unmount } = renderForm(vi.fn(), "t1:u1");
    expect(screen.getByLabelText("Diagnóstico")).toHaveValue("de u1");
    unmount();

    renderForm(vi.fn(), "t1:u2");
    expect(screen.getByLabelText("Diagnóstico")).toHaveValue("");
  });

  it("avisa si no se puede guardar el borrador (almacenamiento lleno) en vez de romperse", () => {
    vi.useFakeTimers();
    renderForm(vi.fn());
    fillAll();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("lleno", "QuotaExceededError");
    });

    act(() => {
      vi.advanceTimersByTime(16_000);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/No se puede guardar una copia automática/);
    vi.restoreAllMocks();
  });

  it("sin usuario identificado no hay autoguardado", () => {
    const { unmount } = renderForm(vi.fn(), null);
    fillAll();
    unmount();
    expect(localStorage.length).toBe(0);
  });
});
