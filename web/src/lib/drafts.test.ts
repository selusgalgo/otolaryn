import { describe, expect, it, vi } from "vitest";
import { buildDraftKey, clearAllDrafts, purgeStaleDrafts, readDraft, writeDraft } from "./drafts";

const HOUR = 3_600_000;

describe("drafts", () => {
  it("escribe y lee un borrador", () => {
    const key = buildDraftKey("t1:u1", "form");
    expect(writeDraft(key, { a: "x" })).toBe(true);
    expect(readDraft<{ a: string }>(key, HOUR)?.fields).toEqual({ a: "x" });
  });

  it("descarta un borrador caducado", () => {
    const key = buildDraftKey("t1:u1", "form");
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now() - 2 * HOUR, fields: {} }));
    expect(readDraft(key, HOUR)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("las claves de usuarios distintos no se mezclan", () => {
    writeDraft(buildDraftKey("t1:u1", "form"), { a: "de u1" });
    expect(readDraft(buildDraftKey("t1:u2", "form"), HOUR)).toBeNull();
  });

  it("writeDraft devuelve false si el almacenamiento falla", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("lleno", "QuotaExceededError");
    });
    expect(writeDraft("k", {})).toBe(false);
    spy.mockRestore();
  });

  it("clearAllDrafts borra los borradores (también los antiguos) y respeta el resto", () => {
    writeDraft(buildDraftKey("t1:u1", "form"), {});
    localStorage.setItem("clinical-entry-draft:new:1", JSON.stringify({ savedAt: Date.now(), fields: {} }));
    localStorage.setItem("otolaryn_remembered_identifier", "ana");
    clearAllDrafts();
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem("otolaryn_remembered_identifier")).toBe("ana");
  });

  it("purgeStaleDrafts quita claves antiguas y caducadas, no las vigentes", () => {
    const fresh = buildDraftKey("t1:u1", "fresh");
    writeDraft(fresh, {});
    localStorage.setItem(buildDraftKey("t1:u1", "old"), JSON.stringify({ savedAt: Date.now() - 2 * HOUR, fields: {} }));
    localStorage.setItem("clinical-entry-draft:new:1", JSON.stringify({ savedAt: Date.now(), fields: {} }));
    purgeStaleDrafts(HOUR);
    expect(Object.keys(localStorage)).toEqual([fresh]);
  });
});
