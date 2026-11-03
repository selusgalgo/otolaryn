import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeviceLockForm } from "./device-lock-form";

const generate = vi.fn();
vi.mock("@/lib/actions/settings", () => ({
  generateDeviceCredentialAction: () => generate(),
  revokeDeviceCredentialAction: vi.fn(),
  updateDeviceLockAction: vi.fn(),
}));

describe("DeviceLockForm", () => {
  it("un doble clic en generar lanza una sola generación y muestra su enlace", async () => {
    generate.mockReset();
    generate.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ token: "TOKEN_UNICO", deviceLock: { enabled: true, hasCredential: true } }),
            20,
          ),
        ),
    );
    render(<DeviceLockForm initialDeviceLock={{ enabled: true, hasCredential: true }} />);

    const button = screen.getByRole("button", { name: "Generar nueva credencial" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText(/device-auth\?t=TOKEN_UNICO/)).toBeInTheDocument());
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("permite generar otra vez cuando la anterior ya terminó", async () => {
    generate.mockReset();
    generate
      .mockResolvedValueOnce({ token: "PRIMERO", deviceLock: { enabled: true, hasCredential: true } })
      .mockResolvedValueOnce({ token: "SEGUNDO", deviceLock: { enabled: true, hasCredential: true } });
    render(<DeviceLockForm initialDeviceLock={{ enabled: true, hasCredential: true }} />);

    fireEvent.click(screen.getByRole("button", { name: "Generar nueva credencial" }));
    await waitFor(() => expect(screen.getByText(/t=PRIMERO/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Generar nueva credencial" }));
    await waitFor(() => expect(screen.getByText(/t=SEGUNDO/)).toBeInTheDocument());
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
