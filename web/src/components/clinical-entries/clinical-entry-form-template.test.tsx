import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DraftScopeProvider } from "@/components/layout/draft-scope";
import type { ClinicalEntry } from "@/lib/types";
import { ClinicalEntryForm } from "./clinical-entry-form";

vi.mock("next/navigation", () => ({
  usePathname: () => "/patients/p1/clinical-entries/new",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/ui/rich-text-editor", () => ({
  RichTextEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      aria-label="editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// Labels of the fields actually painted, in order (rich-text fields render a
// plain <label> with no htmlFor, so they're read by text).
function paintedLabels(): string[] {
  return Array.from(document.querySelectorAll("form label"))
    .map((l) => l.textContent ?? "")
    .filter((t) => t !== "Fecha de la consulta");
}

describe("ClinicalEntryForm — plantillas de consulta", () => {
  it("sin plantilla pinta los campos de siempre (ORL)", () => {
    render(
      <DraftScopeProvider scope={null}>
        <ClinicalEntryForm action={vi.fn()} />
      </DraftScopeProvider>,
    );
    expect(paintedLabels()).toEqual([
      "Motivo de consulta",
      "Exploración",
      "Diagnóstico",
      "Tratamiento",
      "Notas de seguimiento",
    ]);
  });

  it("la plantilla de cirugía pinta Enfermedad actual, Evolución, Diagnóstico, Informe y Doctor que lo envía", () => {
    render(
      <DraftScopeProvider scope={null}>
        <ClinicalEntryForm
          action={vi.fn()}
          template="cirugia"
          referringDoctorSuggestions={["Dr. Pérez"]}
        />
      </DraftScopeProvider>,
    );
    expect(paintedLabels()).toEqual([
      "Enfermedad actual",
      "Evolución",
      "Diagnóstico",
      "Informe",
      "Doctor que lo envía",
    ]);
    // Sugerencias del campo de texto libre.
    expect(screen.getByLabelText("Doctor que lo envía")).toHaveAttribute(
      "list",
      "referringDoctor-options",
    );
    expect(
      document.querySelector(
        '#referringDoctor-options option[value="Dr. Pérez"]',
      ),
    ).not.toBeNull();
  });

  it("un campo de otra plantilla con datos se sigue mostrando y se envía", async () => {
    const action = vi.fn().mockResolvedValue({ success: true });
    const entry = {
      id: "e1",
      visitDate: "2026-11-02T10:30:00.000Z",
      chiefComplaint: "<p>Dolor</p>",
      examinationFindings: null,
      diagnosis: null,
      treatment: "<p>Ibuprofeno</p>",
      followUpNotes: null,
      evolution: null,
      report: null,
      referringDoctor: null,
    } as unknown as ClinicalEntry;
    render(
      <DraftScopeProvider scope={null}>
        <ClinicalEntryForm
          action={action}
          template="cirugia"
          initialValues={entry}
          submitLabel="Guardar cambios"
        />
      </DraftScopeProvider>,
    );
    expect(paintedLabels()).toContain("Tratamiento");

    fireEvent.change(screen.getByLabelText("Doctor que lo envía"), {
      target: { value: "Dra. López" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(action).toHaveBeenCalled());

    const formData = action.mock.calls[0][1] as FormData;
    expect(formData.get("treatment")).toBe("<p>Ibuprofeno</p>");
    expect(formData.get("referringDoctor")).toBe("Dra. López");
    // Exploración no es de esta plantilla y está vacía: ni se pinta ni se envía.
    expect(formData.has("examinationFindings")).toBe(false);
  });
});
