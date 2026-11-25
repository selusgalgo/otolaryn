import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClinicalEntry } from "@/lib/types";
import { ConsultaWorkspace, OpenConsultaLink } from "./consulta-panel";

// useSearchParams que sigue a window.location: history.pushState (parcheado
// abajo) avisa con "locationchange", como hace Next con su router.
vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    usePathname: () => window.location.pathname,
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => {
      const search = React.useSyncExternalStore(
        (cb: () => void) => {
          window.addEventListener("locationchange", cb);
          window.addEventListener("popstate", cb);
          return () => {
            window.removeEventListener("locationchange", cb);
            window.removeEventListener("popstate", cb);
          };
        },
        () => window.location.search,
      );
      return new URLSearchParams(search);
    },
  };
});
vi.mock("@/lib/actions/clinical-entries", () => ({
  getReferringDoctorSuggestions: vi.fn().mockResolvedValue([]),
  updateClinicalEntryAction: vi.fn(),
  deleteClinicalEntryAction: vi.fn(),
}));
vi.mock("@/components/clinical-entries/attachments-panel", () => ({
  AttachmentsPanel: () => null,
}));
// El formulario real ya tiene sus propios tests; aquí basta con su contrato.
vi.mock("@/components/clinical-entries/clinical-entry-form", () => ({
  ClinicalEntryForm: ({
    initialValues,
    onSuccess,
    onCancel,
    fullWidth,
    actionsContainer,
  }: {
    initialValues: ClinicalEntry;
    onSuccess: () => void;
    onCancel: () => void;
    fullWidth?: boolean;
    actionsContainer?: HTMLElement | null;
  }) => {
    const actions = (
      <>
        <button type="button" onClick={onSuccess}>
          Guardar cambios
        </button>
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </>
    );
    return (
      <form aria-label="Formulario de consulta" data-full-width={fullWidth ? "true" : "false"}>
        <input aria-label="Diagnóstico" defaultValue={initialValues.diagnosis ?? ""} />
        {actionsContainer === undefined ? actions : actionsContainer && createPortal(actions, actionsContainer)}
      </form>
    );
  },
}));

function entry(id: string, overrides: Partial<ClinicalEntry> = {}): ClinicalEntry {
  return {
    id,
    tenantId: "t1",
    patientId: "p1",
    authorUserId: "u1",
    visitDate: "2026-11-05T10:30:00.000Z",
    chiefComplaint: `<p>Motivo ${id}</p>`,
    examinationFindings: null,
    diagnosis: `Diagnóstico ${id}`,
    treatment: null,
    followUpNotes: null,
    evolution: null,
    report: null,
    referringDoctor: null,
    authorName: "Ana Pérez",
    authorHonorific: "Dra.",
    status: "firmada",
    draftExpiresAt: null,
    createdAt: "2026-11-05T10:30:00.000Z",
    ...overrides,
  };
}

// Más reciente primero, como el listado; el borrador no entra en el panel.
const ENTRIES = [
  entry("e1"),
  entry("draft", { status: "borrador", draftExpiresAt: "2026-12-01T00:00:00.000Z" }),
  entry("e2", { visitDate: "2026-10-01T09:00:00.000Z", authorName: null, authorHonorific: null }),
  entry("e3", { visitDate: "2026-08-01T09:00:00.000Z" }),
];

function renderWorkspace({ canEdit = true, canDelete = false } = {}) {
  return render(
    <ConsultaWorkspace
      patientId="p1"
      entries={ENTRIES}
      template="orl"
      enabledFields={["chiefComplaint", "examinationFindings", "diagnosis", "treatment", "followUpNotes"]}
      canEdit={canEdit}
      canDelete={canDelete}
    >
      <table>
        <tbody>
          {ENTRIES.filter((e) => e.status === "firmada").map((e) => (
            <tr key={e.id}>
              <td>
                <OpenConsultaLink patientId="p1" entryId={e.id}>
                  {`Abrir ${e.id}`}
                </OpenConsultaLink>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ConsultaWorkspace>,
  );
}

const panel = () => screen.getByRole("complementary", { name: "Consulta" });
const consultaParam = () => new URLSearchParams(window.location.search).get("consulta");

beforeEach(() => {
  window.history.replaceState(null, "", "/patients/p1?entriesPage=1");
  const original = window.history.pushState.bind(window.history);
  vi.spyOn(window.history, "pushState").mockImplementation((...args) => {
    original(...args);
    window.dispatchEvent(new Event("locationchange"));
  });
});

afterEach(() => vi.restoreAllMocks());

describe("ConsultaWorkspace", () => {
  it("un clic en la consulta abre el panel con fecha, doctor y campos, y lo refleja en la URL", () => {
    renderWorkspace();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Abrir e1"));

    expect(consultaParam()).toBe("e1");
    // No pierde los demás parámetros de la ficha (página del listado).
    expect(new URLSearchParams(window.location.search).get("entriesPage")).toBe("1");
    expect(within(panel()).getByText("Dra. Ana Pérez")).toBeInTheDocument();
    expect(within(panel()).getByText("Motivo e1")).toBeInTheDocument();
    expect(within(panel()).getByText("Diagnóstico e1")).toBeInTheDocument();
    expect(screen.getByText("Abrir e1").closest("a")).toHaveAttribute("aria-current", "true");
  });

  it("flota sobre la ficha: la deja inerte y sin scroll, y un clic en el fondo oscuro lo cierra", () => {
    const { container } = renderWorkspace();
    fireEvent.click(screen.getByText("Abrir e1"));

    const ficha = screen.getByText("Abrir e1").closest("table")!.parentElement!;
    expect(ficha).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(container.querySelector("[aria-hidden].fixed")!);

    expect(consultaParam()).toBeNull();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(ficha).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("");
  });

  it("Ctrl/Cmd+clic sigue yendo a la página de la consulta (no abre el panel)", () => {
    renderWorkspace();
    const link = screen.getByText("Abrir e1").closest("a")!;
    expect(link).toHaveAttribute("href", "/patients/p1/clinical-entries/e1");

    // El panel no debe cancelar la navegación del navegador; se anota y se
    // cancela aquí (jsdom no navega de verdad).
    let navigationKept = false;
    const onClick = (event: MouseEvent) => {
      navigationKept = !event.defaultPrevented;
      event.preventDefault();
    };
    window.addEventListener("click", onClick);
    fireEvent.click(link, { metaKey: true });
    window.removeEventListener("click", onClick);

    expect(navigationKept).toBe(true);
    expect(consultaParam()).toBeNull();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("anterior/siguiente recorren las firmadas saltándose los borradores", () => {
    window.history.replaceState(null, "", "/patients/p1?consulta=e1");
    renderWorkspace();

    expect(within(panel()).getByRole("button", { name: "Consulta más reciente" })).toBeDisabled();
    fireEvent.click(within(panel()).getByRole("button", { name: "Consulta anterior" }));
    expect(consultaParam()).toBe("e2");
    expect(within(panel()).getByText("Doctor no indicado")).toBeInTheDocument();

    fireEvent.click(within(panel()).getByRole("button", { name: "Consulta anterior" }));
    expect(consultaParam()).toBe("e3");
    expect(within(panel()).getByRole("button", { name: "Consulta anterior" })).toBeDisabled();

    fireEvent.click(within(panel()).getByRole("button", { name: "Consulta más reciente" }));
    expect(consultaParam()).toBe("e2");
  });

  it("Editar (en el pie fijo) muestra el formulario a ancho completo, con guardar en el pie, y al guardar vuelve a la vista", () => {
    window.history.replaceState(null, "", "/patients/p1?consulta=e1");
    renderWorkspace();

    // Editar va en el pie fijo del panel, como la cabecera arriba.
    const footer = within(panel()).getByRole("button", { name: "Editar" }).closest("footer")!;
    expect(footer).not.toBeNull();
    fireEvent.click(within(panel()).getByRole("button", { name: "Editar" }));
    const form = within(panel()).getByRole("form", { name: "Formulario de consulta" });
    expect(form).toHaveAttribute("data-full-width", "true");
    // Y al editar, ese mismo pie recibe Guardar cambios/Cancelar.
    expect(footer).toContainElement(within(panel()).getByRole("button", { name: "Guardar cambios" }));
    expect(footer).toContainElement(within(panel()).getByRole("button", { name: "Cancelar" }));

    fireEvent.click(within(panel()).getByRole("button", { name: "Guardar cambios" }));
    expect(within(panel()).queryByRole("form")).not.toBeInTheDocument();
    expect(within(panel()).getByText("Diagnóstico e1")).toBeInTheDocument();
  });

  it("sin permiso de edición (recepción) no hay Editar", () => {
    window.history.replaceState(null, "", "/patients/p1?consulta=e1");
    renderWorkspace({ canEdit: false });
    expect(within(panel()).queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    // Sin acciones no queda un pie vacío.
    expect(panel().querySelector("footer")).toBeNull();
  });

  it("cerrar con cambios sin guardar pide confirmación y, si se cancela, no cierra", () => {
    window.history.replaceState(null, "", "/patients/p1?consulta=e1");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWorkspace();

    fireEvent.click(within(panel()).getByRole("button", { name: "Editar" }));
    fireEvent.input(within(panel()).getByLabelText("Diagnóstico"), { target: { value: "Otitis" } });
    fireEvent.click(within(panel()).getByRole("button", { name: "Cerrar" }));

    expect(confirm).toHaveBeenCalled();
    expect(consultaParam()).toBe("e1");
    expect(within(panel()).getByRole("form")).toBeInTheDocument();

    confirm.mockReturnValue(true);
    fireEvent.click(within(panel()).getByRole("button", { name: "Cerrar" }));
    expect(consultaParam()).toBeNull();
  });

  it("Escape cierra el panel sin cambios pendientes", () => {
    window.history.replaceState(null, "", "/patients/p1?consulta=e2");
    renderWorkspace();
    expect(panel()).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(consultaParam()).toBeNull();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("una consulta que no está en la página del listado ofrece abrirla en su página", () => {
    window.history.replaceState(null, "", "/patients/p1?consulta=otra");
    renderWorkspace();
    expect(within(panel()).getByText(/no está en la página actual/)).toBeInTheDocument();
    expect(within(panel()).getByRole("link", { name: "Abrir la consulta" })).toHaveAttribute(
      "href",
      "/patients/p1/clinical-entries/otra",
    );
  });
});
