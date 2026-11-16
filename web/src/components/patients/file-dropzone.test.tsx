import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileDropzone } from "./file-dropzone";

const pdf = (name = "informe.pdf") => new File(["%PDF-1.7"], name, { type: "application/pdf" });
const png = (name = "foto.png") => new File(["x"], name, { type: "image/png" });

function drop(files: File[]) {
  fireEvent.drop(screen.getByRole("button"), { dataTransfer: { files } });
}

describe("FileDropzone", () => {
  it("shows the chosen file's name and reports it when picked from the dialog", async () => {
    const onFileSelected = vi.fn();
    render(<FileDropzone name="file" inputTestId="input" onFileSelected={onFileSelected} />);
    await userEvent.setup().upload(screen.getByTestId("input"), pdf());
    expect(await screen.findByText("informe.pdf")).toBeInTheDocument();
    expect(onFileSelected).toHaveBeenCalledWith(expect.objectContaining({ name: "informe.pdf" }));
  });

  it("takes files dropped on it", () => {
    const onFilesSelected = vi.fn();
    render(<FileDropzone accept="application/pdf" clearAfterSelect onFilesSelected={onFilesSelected} />);
    drop([pdf()]);
    expect(onFilesSelected).toHaveBeenCalledWith([expect.objectContaining({ name: "informe.pdf" })]);
  });

  it("refuses a dropped file of the wrong type — drops skip the browser's accept filter", () => {
    const onFilesSelected = vi.fn();
    render(<FileDropzone accept="application/pdf" clearAfterSelect onFilesSelected={onFilesSelected} />);
    drop([png()]);
    expect(onFilesSelected).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("formato no está admitido");
  });

  it("with several files, keeps the valid ones and says how many were left out", () => {
    const onFilesSelected = vi.fn();
    render(<FileDropzone multiple accept="application/pdf" clearAfterSelect onFilesSelected={onFilesSelected} />);
    drop([pdf("a.pdf"), png(), pdf("b.pdf")]);
    expect(onFilesSelected).toHaveBeenCalledWith([
      expect.objectContaining({ name: "a.pdf" }),
      expect.objectContaining({ name: "b.pdf" }),
    ]);
    expect(screen.getByRole("alert")).toHaveTextContent("1 archivo(s) no se han añadido");
  });

  it("takes only the first file when it is not a multiple dropzone", () => {
    const onFilesSelected = vi.fn();
    render(<FileDropzone clearAfterSelect onFilesSelected={onFilesSelected} />);
    drop([pdf("a.pdf"), pdf("b.pdf")]);
    expect(onFilesSelected).toHaveBeenCalledWith([expect.objectContaining({ name: "a.pdf" })]);
  });

  it("ignores drops while disabled", () => {
    const onFilesSelected = vi.fn();
    render(<FileDropzone disabled clearAfterSelect onFilesSelected={onFilesSelected} />);
    drop([pdf()]);
    expect(onFilesSelected).not.toHaveBeenCalled();
  });

  it("shows the status label instead of the prompt while busy", () => {
    render(<FileDropzone statusLabel="Subiendo..." />);
    expect(screen.getByText("Subiendo...")).toBeInTheDocument();
    expect(screen.queryByText(/Arrastra/)).not.toBeInTheDocument();
  });

  it("is required by default, but not when told otherwise or when it uploads on selection", () => {
    const { rerender } = render(<FileDropzone inputTestId="input" />);
    expect(screen.getByTestId("input")).toBeRequired();
    rerender(<FileDropzone inputTestId="input" required={false} />);
    expect(screen.getByTestId("input")).not.toBeRequired();
    rerender(<FileDropzone inputTestId="input" clearAfterSelect />);
    expect(screen.getByTestId("input")).not.toBeRequired();
  });
});
