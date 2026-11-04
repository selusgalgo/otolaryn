import { describe, expect, it } from "vitest";
import { isDoctor, userDisplayName, withHonorific } from "./doctor-name";

describe("withHonorific", () => {
  it("antepone Dr. o Dra. según el tratamiento", () => {
    expect(withHonorific("Ana Ruiz", "Dra.")).toBe("Dra. Ana Ruiz");
    expect(withHonorific("Luis Gil", "Dr.")).toBe("Dr. Luis Gil");
  });

  it("sin tratamiento guardado usa Dr., como hasta ahora", () => {
    expect(withHonorific("Luis Gil")).toBe("Dr. Luis Gil");
    expect(withHonorific("Luis Gil", null)).toBe("Dr. Luis Gil");
  });

  it("no duplica un título que ya viene en el nombre", () => {
    expect(withHonorific("Dr. Luis Gil", "Dr.")).toBe("Dr. Luis Gil");
    expect(withHonorific("dra ana ruiz", "Dra.")).toBe("dra ana ruiz");
    // "Draper" no es un título.
    expect(withHonorific("Draper Pérez", "Dr.")).toBe("Dr. Draper Pérez");
  });
});

describe("userDisplayName", () => {
  const base = { firstName: "Ana", lastName: "Ruiz" };

  it("un profesional lleva el tratamiento", () => {
    expect(userDisplayName({ ...base, role: "profesional", honorific: "Dra." })).toBe("Dra. Ana Ruiz");
  });

  it("un administrador que también ejerce como médico lo lleva; uno solo administrador, no", () => {
    expect(userDisplayName({ ...base, role: "admin", staffFunction: "profesional", honorific: "Dra." })).toBe(
      "Dra. Ana Ruiz",
    );
    expect(userDisplayName({ ...base, role: "admin", staffFunction: null, honorific: "Dra." })).toBe("Ana Ruiz");
    expect(userDisplayName({ ...base, role: "admin", staffFunction: "recepcion", honorific: "Dra." })).toBe(
      "Ana Ruiz",
    );
  });

  it("recepción nunca lo lleva, aunque tenga un tratamiento guardado", () => {
    expect(userDisplayName({ ...base, role: "recepcion", honorific: "Dr." })).toBe("Ana Ruiz");
  });
});

describe("isDoctor", () => {
  it("coincide con quien ejerce como médico", () => {
    expect(isDoctor({ role: "profesional" })).toBe(true);
    expect(isDoctor({ role: "admin", staffFunction: "profesional" })).toBe(true);
    expect(isDoctor({ role: "admin", staffFunction: null })).toBe(false);
    expect(isDoctor({ role: "recepcion" })).toBe(false);
  });
});
