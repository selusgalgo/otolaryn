import { describe, expect, it } from "vitest";
import { decodeJwtClaims, isJwtExpired } from "./jwt";

function token(claims: object): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256" })}.${b64(claims)}.firma`;
}

describe("jwt helpers", () => {
  it("lee los claims sin verificar la firma", () => {
    expect(decodeJwtClaims(token({ sub: "u1", exp: 10, session_end: 99 }))).toMatchObject({ sub: "u1", exp: 10, session_end: 99 });
  });

  it("devuelve null con un token ausente o ilegible", () => {
    expect(decodeJwtClaims(undefined)).toBeNull();
    expect(decodeJwtClaims("basura")).toBeNull();
    expect(decodeJwtClaims("a.%%%.c")).toBeNull();
  });

  it("solo da por caducado un token con exp ya pasado", () => {
    expect(isJwtExpired(token({ exp: 100 }), 101_000)).toBe(true);
    expect(isJwtExpired(token({ exp: 100 }), 99_000)).toBe(false);
    expect(isJwtExpired("basura")).toBe(false);
  });
});
