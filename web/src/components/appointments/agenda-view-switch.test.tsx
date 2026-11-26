import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgendaViewSwitch } from "./agenda-view-switch";

const save = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/actions/agenda-view", () => ({
  saveAgendaView: (...args: unknown[]) => save(...args),
}));
const hrefs = {
  day: "/appointments?view=day",
  week: "/appointments?view=week",
  month: "/appointments?view=month",
};

describe("Selector de vista de agenda", () => {
  beforeEach(() => {
    save.mockReset();
    push.mockReset();
  });

  it("guarda la vista elegida antes de navegar", async () => {
    save.mockResolvedValue({});
    render(<AgendaViewSwitch view="month" hrefs={hrefs} />);
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(hrefs.week));
    expect(save).toHaveBeenCalledWith("week");
  });

  it("avisa si no se ha podido guardar y mantiene la vista actual", async () => {
    save.mockResolvedValue({
      error: "No se ha podido guardar la vista. Inténtalo de nuevo.",
    });
    render(<AgendaViewSwitch view="month" hrefs={hrefs} />);
    fireEvent.click(screen.getByRole("button", { name: "Día" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se ha podido guardar",
    );
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Mes" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
