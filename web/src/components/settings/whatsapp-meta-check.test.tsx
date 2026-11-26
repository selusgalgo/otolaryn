import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WhatsappMetaCheck } from "./whatsapp-meta-check";

const { check } = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@/lib/actions/settings", () => ({ checkWhatsappConnection: check }));
afterEach(() => vi.clearAllMocks());

it("distingue una cuenta guardada de una activación aún no disponible", async () => {
  check.mockResolvedValueOnce({
    status: "pending",
    warning: "El canal aún no está preparado",
  });
  render(<WhatsappMetaCheck />);
  fireEvent.click(screen.getByRole("button", { name: "Comprobar conexión" }));
  expect(await screen.findByText(/La cuenta está guardada/)).toHaveTextContent(
    "El canal aún no está preparado",
  );
});

it("permite volver a comprobar tras una interrupción", async () => {
  check.mockRejectedValueOnce(new Error("network"));
  render(<WhatsappMetaCheck />);
  fireEvent.click(screen.getByRole("button", { name: "Comprobar conexión" }));
  expect(
    await screen.findByText(/No se ha podido comprobar el estado/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Comprobar conexión" }),
  ).toBeEnabled();
});
