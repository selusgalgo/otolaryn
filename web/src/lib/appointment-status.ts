import type { AppointmentStatus } from "@/lib/types";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Programada",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No presentado",
};

export const APPOINTMENT_STATUSES: AppointmentStatus[] = ["scheduled", "completed", "cancelled", "no_show"];
