import { describe, expect, it } from "vitest";
import { draftDaysLeft, draftExpiryText, isDraftExpiringSoon } from "./draft-expiry";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-04T10:00:00Z");
const inDays = (d: number) => new Date(NOW + d * DAY).toISOString();

describe("caducidad de borradores", () => {
  it("cuenta los días que quedan, redondeando hacia arriba", () => {
    expect(draftDaysLeft(inDays(10), NOW)).toBe(10);
    expect(draftDaysLeft(inDays(2.2), NOW)).toBe(3);
    expect(draftDaysLeft(inDays(0.2), NOW)).toBe(1);
  });

  it("nunca baja de 0 y es null si no es un borrador", () => {
    expect(draftDaysLeft(inDays(-3), NOW)).toBe(0);
    expect(draftDaysLeft(null, NOW)).toBeNull();
  });

  it("avisa en tono de alerta a partir de 3 días", () => {
    expect(isDraftExpiringSoon(inDays(10), NOW)).toBe(false);
    expect(isDraftExpiringSoon(inDays(4), NOW)).toBe(false);
    expect(isDraftExpiringSoon(inDays(3), NOW)).toBe(true);
    expect(isDraftExpiringSoon(inDays(0.5), NOW)).toBe(true);
    expect(isDraftExpiringSoon(null, NOW)).toBe(false);
  });

  it("redacta el aviso", () => {
    expect(draftExpiryText(inDays(7), NOW)).toBe("Se borra en 7 días si no lo terminas");
    expect(draftExpiryText(inDays(1), NOW)).toBe("Se borra mañana si no lo terminas");
    expect(draftExpiryText(inDays(-1), NOW)).toBe("Se borra hoy si no lo terminas");
    expect(draftExpiryText(null, NOW)).toBe("");
  });
});
