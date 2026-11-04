import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HeadingMenu, type HeadingEditor } from "./heading-menu";

// Editor de mentira: lo único que el menú le pide es isActive y la cadena de
// comandos (focus → comando → run).
function fakeEditor(activeLevel?: number) {
  const chain = {
    focus: vi.fn(() => chain),
    toggleHeading: vi.fn(() => chain),
    setParagraph: vi.fn(() => chain),
    run: vi.fn(() => true),
  };
  const editor = {
    isActive: (name: string, attrs?: { level?: number }) => name === "heading" && attrs?.level === activeLevel,
    chain: () => chain,
  } as unknown as HeadingEditor;
  return { editor, chain };
}

async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Encabezados" }));
  return user;
}

describe("HeadingMenu", () => {
  it("muestra un solo botón «Encabezados», sin las siglas H1/H2/H3", () => {
    render(<HeadingMenu editor={fakeEditor().editor} />);
    expect(screen.getByRole("button", { name: "Encabezados" })).toBeInTheDocument();
    for (const sigla of ["H1", "H2", "H3"]) expect(screen.queryByText(sigla)).not.toBeInTheDocument();
  });

  it("ofrece Texto normal, Título, Subtítulo y Apartado", async () => {
    render(<HeadingMenu editor={fakeEditor().editor} />);
    await openMenu();
    expect(screen.getByRole("menuitem", { name: "Texto normal" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Título" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Subtítulo" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Apartado" })).toBeInTheDocument();
  });

  it.each([
    ["Título", 1],
    ["Subtítulo", 2],
    ["Apartado", 3],
  ])("«%s» aplica el encabezado de nivel %i devolviendo el foco al editor", async (label, level) => {
    const { editor, chain } = fakeEditor();
    render(<HeadingMenu editor={editor} />);
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: label }));
    expect(chain.focus).toHaveBeenCalled();
    expect(chain.toggleHeading).toHaveBeenCalledWith({ level });
    expect(chain.run).toHaveBeenCalled();
  });

  it("«Texto normal» vuelve a párrafo", async () => {
    const { editor, chain } = fakeEditor(2);
    render(<HeadingMenu editor={editor} />);
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Texto normal" }));
    expect(chain.setParagraph).toHaveBeenCalled();
    expect(chain.toggleHeading).not.toHaveBeenCalled();
  });

  it("marca la opción activa: el nivel en el que está el cursor, o Texto normal", async () => {
    const withHeading = render(<HeadingMenu editor={fakeEditor(2).editor} />);
    await openMenu();
    expect(screen.getByRole("menuitem", { name: "Subtítulo" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("menuitem", { name: "Título" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("menuitem", { name: "Texto normal" })).not.toHaveAttribute("aria-current");
    withHeading.unmount();

    render(<HeadingMenu editor={fakeEditor().editor} />);
    await openMenu();
    expect(screen.getByRole("menuitem", { name: "Texto normal" })).toHaveAttribute("aria-current", "true");
  });

  it("se deshabilita con el editor deshabilitado o aún sin montar", () => {
    const a = render(<HeadingMenu editor={fakeEditor().editor} disabled />);
    expect(screen.getByRole("button", { name: "Encabezados" })).toBeDisabled();
    a.unmount();
    render(<HeadingMenu editor={null} />);
    expect(screen.getByRole("button", { name: "Encabezados" })).toBeDisabled();
  });
});
