import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Patient } from "@/lib/types";
import { PatientPicker } from "./patient-picker";

const search = vi.fn();
vi.mock("@/lib/actions/patients", () => ({
  searchPatientsAction: (q: string) => search(q),
}));

const patient = (over: Partial<Patient>): Patient =>
  ({ id: "p", firstName: "Ana", lastName: "García", documentId: "12345678Z", phone: "+34 600 111 222", phone2: null, ...over }) as Patient;

beforeEach(() => {
  vi.useFakeTimers();
  search.mockReset();
});
afterEach(() => vi.useRealTimers());

async function typeAndWait(value: string) {
  fireEvent.change(screen.getByLabelText(/Buscar paciente/), { target: { value } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
}

describe("PatientPicker", () => {
  it("anuncia que se busca por nombre, documento o teléfono", () => {
    render(<PatientPicker />);
    expect(screen.getByLabelText("Buscar paciente (nombre, documento o teléfono)")).toBeInTheDocument();
  });

  it("cada resultado muestra el teléfono junto al documento, para distinguir nombres parecidos", async () => {
    search.mockResolvedValue([
      patient({ id: "1", phone: "+34 600 111 222" }),
      patient({ id: "2", documentId: "87654321X", phone: "+34 699 333 444", phone2: "911 000 000" }),
    ]);
    render(<PatientPicker />);
    await typeAndWait("ana garcia");

    expect(search).toHaveBeenCalledWith("ana garcia");
    expect(screen.getByText("12345678Z · Tel. +34 600 111 222")).toBeInTheDocument();
    expect(screen.getByText("87654321X · Tel. +34 699 333 444 / 911 000 000")).toBeInTheDocument();
  });

  it("al elegir un paciente, el resumen conserva documento y teléfono", async () => {
    search.mockResolvedValue([patient({ id: "1" })]);
    render(<PatientPicker />);
    await typeAndWait("ana");

    fireEvent.click(screen.getByRole("button", { name: /Ana García/ }));
    expect(screen.getByText("12345678Z · Tel. +34 600 111 222")).toBeInTheDocument();
    expect(document.querySelector<HTMLInputElement>('input[name="patientId"]')?.value).toBe("1");
  });

  it("un paciente sin documento se muestra con el guion habitual y su teléfono", async () => {
    search.mockResolvedValue([patient({ id: "1", documentId: null, phone: "600000000" })]);
    render(<PatientPicker />);
    await typeAndWait("ana");
    expect(screen.getByText("- · Tel. 600000000")).toBeInTheDocument();
  });
});
