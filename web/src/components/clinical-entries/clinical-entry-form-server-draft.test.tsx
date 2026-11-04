import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftScopeProvider } from "@/components/layout/draft-scope";
import type { ClinicalEntryFormState, DraftSaveResult, DraftValues } from "@/lib/actions/clinical-entries";
import { buildDraftKey } from "@/lib/drafts";
import type { ClinicalEntry } from "@/lib/types";
import { ClinicalEntryForm } from "./clinical-entry-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/patients/p1/clinical-entries/new",
  useRouter: () => ({ push }),
}));
vi.mock("@/components/ui/rich-text-editor", () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const SCOPE = "t1:u1";
const KEY = buildDraftKey(SCOPE, "new:p1");
const TICK = 16_000;

type Save = (draftId: string | null, values: DraftValues) => Promise<DraftSaveResult>;
type Finalize = (
  draftId: string,
  prev: ClinicalEntryFormState,
  formData: FormData,
) => Promise<ClinicalEntryFormState>;

function renderForm(opts: {
  save: Save;
  finalize?: Finalize;
  action?: (prev: ClinicalEntryFormState, fd: FormData) => Promise<ClinicalEntryFormState>;
  draftId?: string;
  initialValues?: Partial<ClinicalEntry>;
}) {
  return render(
    <DraftScopeProvider scope={SCOPE}>
      <ClinicalEntryForm
        action={opts.action ?? vi.fn().mockResolvedValue({})}
        draftKey="new:p1"
        initialValues={opts.initialValues as ClinicalEntry | undefined}
        serverDraft={{ draftId: opts.draftId, save: opts.save, finalize: opts.finalize }}
      />
    </DraftScopeProvider>,
  );
}

const write = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function tick(ms = TICK) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  push.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("ClinicalEntryForm — borrador en el servidor (solo altas)", () => {
  it("no crea ningún borrador mientras no se ha escrito nada", async () => {
    const save = vi.fn<Save>();
    renderForm({ save });
    await tick();
    expect(save).not.toHaveBeenCalled();
  });

  it("el primer autoguardado crea el borrador y los siguientes lo actualizan", async () => {
    const save = vi.fn<Save>().mockResolvedValue({ id: "d1", savedAt: new Date().toISOString() });
    renderForm({ save });

    write("Diagnóstico", "Otitis");
    await tick();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toBeNull();
    expect(save.mock.calls[0][1]).toMatchObject({ diagnosis: "Otitis" });

    write("Diagnóstico", "Otitis media");
    await tick();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toBe("d1");
    expect(save.mock.calls[1][1]).toMatchObject({ diagnosis: "Otitis media" });
  });

  it("no reenvía lo que el servidor ya tiene", async () => {
    const save = vi.fn<Save>().mockResolvedValue({ id: "d1" });
    renderForm({ save });
    write("Diagnóstico", "Rinitis");
    await tick();
    await tick();
    await tick();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("una vez en el servidor, sobra la copia local (sin texto clínico duplicado en el navegador)", async () => {
    const save = vi.fn<Save>().mockResolvedValue({ id: "d1" });
    renderForm({ save });
    write("Diagnóstico", "Faringitis");
    await tick();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("si el servidor falla avisa y el borrador local sigue siendo la red de seguridad", async () => {
    const save = vi.fn<Save>().mockResolvedValue({ sessionExpired: true, error: "Tu sesión ha caducado." });
    renderForm({ save });
    write("Diagnóstico", "Sinusitis");
    await tick();
    expect(screen.getByText(/Tu sesión ha caducado: lo escrito se conserva en este dispositivo/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(KEY)!).fields.diagnosis).toBe("Sinusitis");
  });

  it("al abrir un borrador existente no se reenvía (no renueva su caducidad) hasta que se edita", async () => {
    const save = vi.fn<Save>().mockResolvedValue({ id: "d9" });
    renderForm({
      save,
      draftId: "d9",
      initialValues: {
        id: "d9",
        visitDate: "2026-11-02T10:30:00.000Z",
        chiefComplaint: "Tos",
        diagnosis: "Bronquitis",
      } as Partial<ClinicalEntry>,
    });
    await tick();
    expect(save).not.toHaveBeenCalled();

    write("Diagnóstico", "Bronquitis aguda");
    await tick();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toBe("d9");
  });

  it("firmar tras crearse el borrador firma ESE borrador y no crea una consulta aparte", async () => {
    const save = vi.fn<Save>().mockResolvedValue({ id: "d1" });
    const create = vi.fn().mockResolvedValue({ success: true, redirectTo: "/creada" });
    const finalize = vi
      .fn<Finalize>()
      .mockResolvedValue({ success: true, redirectTo: "/patients/p1/clinical-entries/d1" });
    renderForm({ save, action: create, finalize });

    write("Diagnóstico", "Amigdalitis");
    await tick();

    vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: "Guardar entrada" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/patients/p1/clinical-entries/d1"));

    expect(finalize).toHaveBeenCalledTimes(1);
    expect(finalize.mock.calls[0][0]).toBe("d1");
    expect(create).not.toHaveBeenCalled();
  });

  it("sin borrador previo, firmar crea la consulta directamente", async () => {
    const save = vi.fn<Save>();
    const create = vi.fn().mockResolvedValue({ success: true, redirectTo: "/creada" });
    const finalize = vi.fn<Finalize>();
    renderForm({ save, action: create, finalize });

    write("Diagnóstico", "Escrito y firmado antes del primer autoguardado");
    vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: "Guardar entrada" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/creada"));
    expect(create).toHaveBeenCalledTimes(1);
    expect(finalize).not.toHaveBeenCalled();
  });

  it("«Guardar borrador» sincroniza al momento sin esperar al temporizador", async () => {
    const save = vi.fn<Save>().mockResolvedValue({ id: "d1" });
    renderForm({ save });
    write("Diagnóstico", "Urgente");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Borrador guardado a las/)).toBeInTheDocument();
  });
});
