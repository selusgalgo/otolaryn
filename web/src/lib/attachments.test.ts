import { describe, expect, it } from "vitest";
import { formatFileSize, targetImageSize } from "./attachments";

describe("targetImageSize", () => {
  it("no amplía ni toca una imagen que ya cabe", () => {
    expect(targetImageSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(targetImageSize(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  it("reduce el lado largo a 1920 conservando proporciones (horizontal y vertical)", () => {
    expect(targetImageSize(4000, 3000)).toEqual({ width: 1920, height: 1440 });
    expect(targetImageSize(3000, 4000)).toEqual({ width: 1440, height: 1920 });
  });
});

describe("formatFileSize", () => {
  it("usa B, KB y MB", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(1572864)).toBe("1,5 MB");
  });
});
