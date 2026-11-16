import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const install = vi.fn();
const remove = vi.fn();
vi.mock("@/lib/actions/creditor-certificate", () => ({
  installCertificateAction: (...args: unknown[]) => install(...args),
  removeCertificateAction: (...args: unknown[]) => remove(...args),
}));

import { CertificateManager } from "./certificate-manager";

const p12 = () => new File(["p12-bytes"], "acreedor.p12", { type: "application/x-pkcs12" });
// jsdom's constraint validation doesn't see the files user-event puts in a
// required file input, so clicking the button would be blocked there (a real
// browser lets it through). Submitting the form directly skips only that.
const submit = (container: HTMLElement) => fireEvent.submit(container.querySelector("form")!);
const fileInput = (container: HTMLElement) => container.querySelector<HTMLInputElement>('input[type="file"]')!;

beforeEach(() => {
  vi.clearAllMocks();
  install.mockResolvedValue({});
  remove.mockResolvedValue({ success: true });
});

describe("CertificateManager — installing", () => {
  it("offers a drop zone and a password field when nothing is installed", () => {
    const { container } = render(<CertificateManager source={null} expanded />);
    expect(screen.getByText(/Arrastra tu certificado \(\.p12\) aquí/)).toBeInTheDocument();
    expect(fileInput(container)).toHaveAttribute("accept", expect.stringContaining(".p12"));
    const password = screen.getByLabelText("Contraseña del certificado");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByRole("button", { name: "Instalar certificado" })).toBeInTheDocument();
  });

  it("shows the chosen file and sends the passphrase to the install action", async () => {
    const user = userEvent.setup();
    const { container } = render(<CertificateManager source={null} expanded />);

    await user.upload(fileInput(container), p12());
    expect(await screen.findByText("acreedor.p12")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Contraseña del certificado"), "mi-clave");
    submit(container);

    await waitFor(() => expect(install).toHaveBeenCalledTimes(1));
    const formData = install.mock.calls[0][1] as FormData;
    expect(formData.get("passphrase")).toBe("mi-clave");
    // The file field is part of the form that is submitted. (jsdom doesn't copy
    // a user-event upload into FormData, so its content can't be asserted here;
    // the action's own test covers it being forwarded to the API.)
    expect(formData.has("file")).toBe(true);
  });

  it("shows why the certificate was refused", async () => {
    install.mockResolvedValue({ error: "La contraseña del certificado no es correcta." });
    const user = userEvent.setup();
    const { container } = render(<CertificateManager source={null} expanded />);

    await user.upload(fileInput(container), p12());
    await user.type(screen.getByLabelText("Contraseña del certificado"), "mala");
    submit(container);

    expect(await screen.findByRole("alert")).toHaveTextContent("La contraseña del certificado no es correcta.");
  });

  it("refuses a dropped file that is not a certificate, before anything is sent", async () => {
    const { container } = render(<CertificateManager source={null} expanded />);
    const dropZone = container.querySelector('[role="button"]')!;

    const picture = new File(["x"], "foto.png", { type: "image/png" });
    fireEvent.drop(dropZone, { dataTransfer: { files: [picture] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("formato no está admitido");
    expect(install).not.toHaveBeenCalled();
  });
});

describe("CertificateManager — an installed certificate", () => {
  it("keeps the upload form tucked under “Sustituir” while the certificate is fine", () => {
    render(<CertificateManager source="upload" expanded={false} />);
    expect(screen.getByText("Sustituir el certificado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar certificado" })).toBeInTheDocument();
  });

  it("asks before removing it, and warns that orders will go out unsigned", async () => {
    const user = userEvent.setup();
    render(<CertificateManager source="upload" expanded={false} />);

    await user.click(screen.getByRole("button", { name: "Quitar certificado" }));
    expect(screen.getByText(/sin tu firma/)).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Sí, quitar" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
  });

  it("can back out of removing it", async () => {
    const user = userEvent.setup();
    render(<CertificateManager source="upload" expanded={false} />);
    await user.click(screen.getByRole("button", { name: "Quitar certificado" }));
    await user.click(screen.getByRole("button", { name: "No" }));
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Quitar certificado" })).toBeInTheDocument();
  });

  it("does not offer to remove a certificate that comes from the server configuration", () => {
    render(<CertificateManager source="env" expanded={false} />);
    expect(screen.queryByRole("button", { name: "Quitar certificado" })).not.toBeInTheDocument();
    expect(screen.getByText(/configuración del servidor/)).toBeInTheDocument();
  });
});
