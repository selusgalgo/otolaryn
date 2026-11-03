import { describe, expect, it } from "vitest";
import { safeRedirectTarget } from "./safe-redirect";

describe("safeRedirectTarget", () => {
  it("acepta rutas internas con query", () => {
    expect(safeRedirectTarget("/patients/1?page=2")).toBe("/patients/1?page=2");
  });

  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "evil", "", null, undefined, "/a\nb"])(
    "rechaza %j",
    (value) => {
      expect(safeRedirectTarget(value)).toBeNull();
    },
  );
});
