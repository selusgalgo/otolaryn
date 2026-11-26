import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AppointmentPeriodView,
  type PeriodAppointment,
} from "./appointment-period-view";
import type { Schedule } from "@/lib/types";

const reschedule = vi.fn().mockResolvedValue({});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/appointments", () => ({
  rescheduleAppointmentAction: (...args: unknown[]) => reschedule(...args),
}));
vi.mock("@/components/appointments/new-appointment-dialog", () => ({
  NewAppointmentDialog: () => null,
}));

const schedule = {
  days: [{ weekday: 2, slots: [{ startTime: "09:00", endTime: "18:00" }] }],
} as Schedule;
const appointment = (
  id: string,
  time: string,
  doctor: string,
  duration = 10,
): PeriodAppointment => ({
  id,
  patientName: `Paciente ${id}`,
  scheduledAt: `2026-11-18T${time}:00+01:00`,
  durationMinutes: duration,
  status: "scheduled",
  practitionerId: doctor,
  practitionerName: doctor,
  practitionerHonorific: null,
});
const props = {
  dateKey: "2026-11-18",
  todayKey: "2026-11-18",
  periodLabel: "18 de noviembre",
  weekDateKeys: [
    "2026-11-16",
    "2026-11-17",
    "2026-11-18",
    "2026-11-19",
    "2026-11-20",
    "2026-11-21",
    "2026-11-22",
  ],
  schedule,
  practitioners: null,
  appointments: [
    appointment("1", "09:00", "Médico A"),
    appointment("2", "09:20", "Médico A"),
    appointment("3", "09:00", "Médico B"),
    appointment("4", "09:00", "Médico C"),
    appointment("5", "09:00", "Médico D", 30),
  ],
};

describe("Agenda con citas cortas", () => {
  it("mantiene las citas de diez minutos legibles y alineadas entre profesionales", () => {
    render(<AppointmentPeriodView {...props} view="day" />);
    const first = screen.getByRole("link", { name: /Ver cita de Paciente 1/ });
    const second = screen.getByRole("link", { name: /Ver cita de Paciente 2/ });
    const otherDoctor = screen.getByRole("link", {
      name: /Ver cita de Paciente 3/,
    });
    expect(first.parentElement).toHaveStyle({ top: "0px", height: "32px" });
    expect(second.parentElement).toHaveStyle({ top: "64px", height: "32px" });
    expect(otherDoctor.parentElement).toHaveStyle({
      top: "0px",
      height: "32px",
    });
    expect(within(first).getByText("Paciente 1")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Editar hora de Paciente 1" }),
    ).toBeInTheDocument();
  });

  it("permite arrastrar una cita de diez minutos a las 09:10", async () => {
    reschedule.mockClear();
    render(<AppointmentPeriodView {...props} view="day" />);
    const card = screen.getByRole("link", {
      name: /Ver cita de Paciente 1/,
    }).parentElement!;
    const column = screen.getByRole("region", { name: "Médico A" });
    const handle = within(card).getByTitle("Arrastrar para cambiar la hora");
    const dataTransfer = {
      effectAllowed: "",
      dropEffect: "",
      setData: vi.fn(),
    };
    const drag = (
      element: HTMLElement,
      type: "dragStart" | "dragOver" | "drop",
      clientY: number,
    ) => {
      const event = createEvent[type](element, { dataTransfer });
      Object.defineProperty(event, "clientY", { value: clientY });
      fireEvent(element, event);
    };
    drag(handle, "dragStart", 2);
    drag(column, "dragOver", 34);
    expect(screen.getByText("09:10 · Soltar aquí")).toBeInTheDocument();
    drag(column, "drop", 34);
    await waitFor(() =>
      expect(reschedule).toHaveBeenCalledWith("1", "2026-11-18", "09:10", 10),
    );
    expect(
      await screen.findByText("Cita movida de 09:00 a 09:10."),
    ).toBeInTheDocument();
  });

  it("ofrece espacio para leer citas cortas también en la vista semanal", () => {
    render(
      <AppointmentPeriodView
        {...props}
        appointments={[
          appointment("1", "09:00", "Médico A"),
          appointment("2", "09:10", "Médico A"),
        ]}
        view="week"
      />,
    );
    const first = screen.getByRole("link", { name: /Ver cita de Paciente 1/ });
    const second = screen.getByRole("link", { name: /Ver cita de Paciente 2/ });
    expect(first.parentElement).toHaveStyle({ top: "0px", height: "32px" });
    expect(second.parentElement).toHaveStyle({ top: "32px", height: "32px" });
    expect(within(first).getByText("Paciente 1")).toBeVisible();
  });
});
