import { describe, expect, it } from "vitest";
import { matchesAccept } from "./file-accept";

const file = (name: string, type: string) => ({ name, type });

describe("matchesAccept", () => {
  it("accepts anything when there is no accept list", () => {
    expect(matchesAccept(file("a.xyz", ""), undefined)).toBe(true);
    expect(matchesAccept(file("a.xyz", ""), "")).toBe(true);
  });

  it("matches exact MIME types", () => {
    const accept = "image/png,image/jpeg,image/webp";
    expect(matchesAccept(file("logo.png", "image/png"), accept)).toBe(true);
    expect(matchesAccept(file("logo.gif", "image/gif"), accept)).toBe(false);
  });

  it("matches type families", () => {
    expect(matchesAccept(file("a.gif", "image/gif"), "image/*")).toBe(true);
    expect(matchesAccept(file("a.pdf", "application/pdf"), "image/*")).toBe(
      false,
    );
  });

  it("matches extensions regardless of case", () => {
    expect(matchesAccept(file("Datos.XLSX", ""), ".xls,.xlsx,.csv")).toBe(true);
    expect(
      matchesAccept(file("datos.txt", "text/plain"), ".xls,.xlsx,.csv"),
    ).toBe(false);
  });

  it("copes with spaces in the list and a PDF with no reported type", () => {
    expect(
      matchesAccept(file("firmada.pdf", ""), "application/pdf, .pdf"),
    ).toBe(true);
  });
});
