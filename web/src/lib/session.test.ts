import { beforeEach, describe, expect, it, vi } from "vitest";

const set = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ set, get: vi.fn(), delete: vi.fn() }),
}));

import { setDeviceToken, setSessionToken } from "./session";

beforeEach(() => set.mockReset());

describe("cookies de sesión", () => {
  it("la cookie de dispositivo es persistente (400 días), no de sesión del navegador", async () => {
    await setDeviceToken("a".repeat(43));
    const [name, value, options] = set.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(name).toBe("otolaryn_device");
    expect(value).toHaveLength(43);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(options.maxAge).toBe(400 * 24 * 60 * 60);
  });

  it("la cookie de sesión dura lo que el token (exp), con 1 h si no se puede leer", async () => {
    const exp = Math.floor(Date.now() / 1000) + 1800;
    const payload = btoa(JSON.stringify({ exp })).replace(/=/g, "");
    await setSessionToken(`x.${payload}.y`);
    const maxAge = (set.mock.calls[0] as [string, string, { maxAge: number }])[2].maxAge;
    expect(maxAge).toBeGreaterThan(1790);
    expect(maxAge).toBeLessThanOrEqual(1800);

    set.mockReset();
    await setSessionToken("ilegible");
    expect((set.mock.calls[0] as [string, string, { maxAge: number }])[2].maxAge).toBe(3600);
  });
});
