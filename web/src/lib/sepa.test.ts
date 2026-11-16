import { describe, expect, it } from "vitest";
import { computeSepaAmounts, formatCents, parseDecimal } from "./sepa";

describe("computeSepaAmounts", () => {
  it("adds VAT and subtracts IRPF, both on the base, rounded per line", () => {
    expect(computeSepaAmounts(49.9, 21, 15)).toEqual({
      baseCents: 4990,
      vatCents: 1048,
      irpfCents: 749,
      totalCents: 5289,
    });
  });

  it("handles a client with no IRPF withholding", () => {
    expect(computeSepaAmounts(80, 21, 0).totalCents).toBe(9680);
  });
});

describe("parseDecimal", () => {
  it("accepts a decimal comma", () => {
    expect(parseDecimal(" 49,90 ")).toBe(49.9);
  });

  it("returns NaN for non-numbers", () => {
    expect(parseDecimal("abc")).toBeNaN();
  });
});

describe("formatCents", () => {
  it("formats as Spanish euros", () => {
    expect(formatCents(5289).replace(/\s/g, " ")).toBe("52,89 €");
  });
});
