import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RichTextEditor } from "./rich-text-editor";

// Tiptap de verdad (no un editor de mentira): comprueba que el menú
// «Encabezados» produce el HTML h1/h2/h3 que guardan el backend y el PDF.
async function renderEditor(value: string) {
  const onChange = vi.fn<(html: string) => void>();
  render(<RichTextEditor value={value} onChange={onChange} />);
  // Tiptap monta el editor después del primer render (immediatelyRender: false).
  await waitFor(() => expect(document.querySelector(".ProseMirror")).not.toBeNull());
  return onChange;
}

async function choose(user: ReturnType<typeof userEvent.setup>, option: string) {
  await user.click(screen.getByRole("button", { name: "Encabezados" }));
  await user.click(screen.getByRole("menuitem", { name: option }));
}

describe("RichTextEditor — barra de herramientas", () => {
  it("ya no enseña H1/H2/H3 y sí «Encabezados», con los nombres en cada botón", async () => {
    await renderEditor("<p>Hola</p>");
    for (const sigla of ["H1", "H2", "H3"]) expect(screen.queryByText(sigla)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Encabezados" })).toBeInTheDocument();
    for (const name of ["Negrita", "Cursiva", "Lista con viñetas", "Lista numerada", "Cita"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("title", name);
    }
  });

  it("Título, Subtítulo y Apartado guardan h1, h2 y h3, y Texto normal vuelve a párrafo", async () => {
    const onChange = await renderEditor("<p>Hola</p>");
    const user = userEvent.setup();
    const last = () => onChange.mock.calls.at(-1)?.[0];

    // Tiptap 3 añade un párrafo vacío tras un encabezado final (TrailingNode),
    // igual que ya hacía con los botones H1/H2/H3: lo que importa es el nivel.
    await choose(user, "Título");
    await waitFor(() => expect(last()).toMatch(/^<h1>Hola<\/h1>/));

    await choose(user, "Subtítulo");
    await waitFor(() => expect(last()).toMatch(/^<h2>Hola<\/h2>/));

    await choose(user, "Apartado");
    await waitFor(() => expect(last()).toMatch(/^<h3>Hola<\/h3>/));

    await choose(user, "Texto normal");
    await waitFor(() => expect(last()).toMatch(/^<p>Hola<\/p>/));
  });

  it("el botón Encabezados se resalta mientras el cursor está en un encabezado", async () => {
    await renderEditor("<h2>Ya es subtítulo</h2>");
    const trigger = screen.getByRole("button", { name: "Encabezados" });
    await waitFor(() => expect(trigger.className).toContain("bg-accent"));
  });
});
