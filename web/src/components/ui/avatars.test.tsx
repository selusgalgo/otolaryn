import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./avatar";
import { InitialsAvatar } from "./initials-avatar";

describe("burbujas de iniciales", () => {
  it("InitialsAvatar: por defecto es de paciente (azul de marca) y muestra las iniciales", () => {
    const { container } = render(<InitialsAvatar firstName="ana" lastName="ruiz" />);
    const bubble = container.firstElementChild as HTMLElement;
    expect(bubble).toHaveTextContent("AR");
    expect(bubble.dataset.variant).toBe("patient");
    expect(bubble.className).toContain("bg-primary-tint");
    expect(bubble.className).not.toContain("bg-success");
  });

  it("InitialsAvatar: la variante doctor usa otro tono (verde)", () => {
    const { container } = render(<InitialsAvatar firstName="Luis" lastName="Gil" variant="doctor" />);
    const bubble = container.firstElementChild as HTMLElement;
    expect(bubble).toHaveTextContent("LG");
    expect(bubble.dataset.variant).toBe("doctor");
    expect(bubble.className).toContain("bg-success/15");
    expect(bubble.className).not.toContain("bg-primary-tint");
  });

  it("Avatar (barra lateral): mismas dos variantes", () => {
    const patient = render(<Avatar firstName="Ana" lastName="Ruiz" />);
    expect((patient.container.firstElementChild as HTMLElement).className).toContain("bg-primary-tint");
    patient.unmount();

    const doctor = render(<Avatar firstName="Ana" lastName="Ruiz" variant="doctor" />);
    const bubble = doctor.container.firstElementChild as HTMLElement;
    expect(bubble.className).toContain("bg-success/15");
    expect(bubble).toHaveTextContent("AR");
  });
});
