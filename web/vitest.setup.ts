import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom no implementa las medidas de Range que ProseMirror (Tiptap) usa al
// desplazar la vista hasta el cursor: sin esto lanza un error sin capturar
// desde un temporizador y hace fallar la ejecución aunque el test pase.
if (typeof Range !== "undefined") {
  const emptyRect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0, toJSON: () => ({}) };
  Range.prototype.getBoundingClientRect = () => emptyRect as DOMRect;
  Range.prototype.getClientRects = () =>
    ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});
