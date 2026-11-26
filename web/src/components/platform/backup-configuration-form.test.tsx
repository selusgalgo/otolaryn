import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const save = vi.fn();
vi.mock("@/lib/actions/backups", () => ({
  saveBackupConfigurationAction: (...args: unknown[]) => save(...args),
}));

import { BackupConfigurationForm } from "./backup-configuration-form";

describe("BackupConfigurationForm", () => {
  it("submits the configuration and clears both secrets on success", async () => {
    save.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(
      <BackupConfigurationForm
        bucket="private-backups"
        region="eu-central-003"
      />,
    );
    const keyId = screen.getByLabelText("ID de clave de aplicación");
    const secret = screen.getByLabelText("Clave de aplicación");
    expect(keyId).toHaveAttribute("type", "password");
    expect(secret).toHaveAttribute("type", "password");
    await user.type(keyId, "key-id");
    await user.type(secret, "secret-value");
    await user.click(
      screen.getByRole("button", { name: "Comprobar y guardar" }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const data = save.mock.calls[0][1] as FormData;
    expect(data.get("bucket")).toBe("private-backups");
    expect(data.get("keyId")).toBe("key-id");
    expect(data.get("applicationKey")).toBe("secret-value");
    await screen.findByText("Configuración guardada.");
    await waitFor(() =>
      expect(screen.getByLabelText("Clave de aplicación")).toHaveValue(""),
    );
    expect(screen.getByLabelText("ID de clave de aplicación")).toHaveValue("");
  });
});
