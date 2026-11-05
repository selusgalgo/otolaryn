import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentsPanel } from "./attachments-panel";

const list = vi.fn();
const upload = vi.fn();
const remove = vi.fn();
vi.mock("@/lib/actions/clinical-entry-attachments", () => ({
  listAttachmentsAction: (...a: unknown[]) => list(...a),
  uploadAttachmentAction: (...a: unknown[]) => upload(...a),
  deleteAttachmentAction: (...a: unknown[]) => remove(...a),
}));

const att = (id: string, name: string, mimeType = "application/pdf") => ({
  id,
  clinicalEntryId: "e1",
  originalName: name,
  mimeType,
  sizeBytes: 2048,
  uploadedByUserId: "u1",
  createdAt: "2026-01-01T00:00:00Z",
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AttachmentsPanel", () => {
  it("solo lectura: lista los archivos con enlace y sin botones de añadir ni quitar", async () => {
    list.mockResolvedValue({ attachments: [att("a1", "Analítica.pdf")] });
    render(<AttachmentsPanel patientId="p1" entryId="e1" canManage={false} />);
    expect(await screen.findByText("Analítica.pdf")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir Analítica.pdf" })).toHaveAttribute(
      "href",
      "/patients/p1/clinical-entries/e1/attachments/a1",
    );
    expect(screen.queryByRole("button", { name: "Adjuntar archivo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Quitar/ })).not.toBeInTheDocument();
  });

  it("solo lectura y sin archivos: no pinta nada", async () => {
    list.mockResolvedValue({ attachments: [] });
    const { container } = render(<AttachmentsPanel patientId="p1" entryId="e1" canManage={false} />);
    await waitFor(() => expect(list).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("en un alta sin borrador crea el borrador al subir el primer archivo", async () => {
    const ensure = vi.fn().mockResolvedValue("draft1");
    upload.mockResolvedValue({ attachment: att("a2", "informe.pdf") });
    const user = userEvent.setup();
    render(<AttachmentsPanel patientId="p1" entryId={null} ensureEntryId={ensure} canManage />);
    const file = new File(["%PDF-1.7"], "informe.pdf", { type: "application/pdf" });
    await user.upload(screen.getByTestId("attachment-input"), file);
    expect(await screen.findByText("informe.pdf")).toBeInTheDocument();
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith("p1", "draft1", expect.any(FormData));
  });

  it("quita un archivo tras confirmar", async () => {
    list.mockResolvedValue({ attachments: [att("a1", "Analítica.pdf")] });
    remove.mockResolvedValue({});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<AttachmentsPanel patientId="p1" entryId="e1" canManage />);
    await user.click(await screen.findByRole("button", { name: "Quitar Analítica.pdf" }));
    await waitFor(() => expect(screen.queryByText("Analítica.pdf")).not.toBeInTheDocument());
    expect(remove).toHaveBeenCalledWith("p1", "e1", "a1");
  });
});
