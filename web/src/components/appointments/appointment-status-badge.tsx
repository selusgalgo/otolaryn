import { cn } from "@/lib/utils";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointment-status";
import type { AppointmentStatus } from "@/lib/types";

// Colors per spec: Programada reuses --accent/--accent-foreground and
// Cancelada reuses --destructive (both already equal these exact hex
// values elsewhere in the theme). Completada's text (#064040) has no
// matching token, so it's a one-off. No_show has no spec'd color — treated
// as neutral until there's a real color for it.
const STATUS_STYLES: Record<AppointmentStatus, string> = {
  scheduled: "bg-accent/33 text-accent-foreground",
  completed: "bg-success/10 text-[#064040]",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-muted text-muted-foreground",
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
      )}
    >
      {APPOINTMENT_STATUS_LABELS[status]}
    </span>
  );
}
