import { cn } from "@/lib/utils";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointment-status";
import type { AppointmentStatus } from "@/lib/types";

// Semantic color rule: 700 for the text, 100 for the background — same tag
// format as RoleBadge, one hue per status.
const STATUS_STYLES: Record<AppointmentStatus, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
  no_show: "bg-slate-100 text-slate-700",
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 font-button text-button uppercase",
        STATUS_STYLES[status],
      )}
    >
      {APPOINTMENT_STATUS_LABELS[status]}
    </span>
  );
}
