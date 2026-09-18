import { cn } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/roles";
import type { Role } from "@/lib/types";

// Semantic color rule: 700 for the text, 50 for the background — one hue
// per role so they're distinguishable at a glance in a list.
const ROLE_STYLES: Record<Role, string> = {
  admin: "bg-violet-50 text-violet-700",
  profesional: "bg-teal-50 text-teal-700",
  recepcion: "bg-orange-50 text-orange-700",
  superadmin: "bg-rose-50 text-rose-700",
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 font-button text-button uppercase",
        ROLE_STYLES[role],
      )}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}
