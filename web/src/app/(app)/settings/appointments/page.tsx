import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppointmentDefaultsForm } from "@/components/settings/appointment-defaults-form";
import { updateAppointmentDefaultsAction } from "@/lib/actions/settings";
import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import type { AppointmentDefaults } from "@/lib/types";

export default async function AppointmentSettingsPage() {
  const me = await getCurrentUser();
  if (me.role !== "admin") {
    redirect("/dashboard");
  }

  const defaults = await apiFetch<AppointmentDefaults>("/settings/appointment-defaults");

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeftIcon className="size-4" />
          Volver a Configuración
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Citas</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Duración de las citas</CardTitle>
        </CardHeader>
        <CardContent>
          <AppointmentDefaultsForm
            action={updateAppointmentDefaultsAction}
            initialDefaultDurationMinutes={defaults.defaultDurationMinutes}
          />
        </CardContent>
      </Card>
    </div>
  );
}
