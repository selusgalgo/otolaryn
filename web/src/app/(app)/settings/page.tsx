import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleForm } from "@/components/settings/schedule-form";
import { updateScheduleAction } from "@/lib/actions/settings";
import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import type { Schedule } from "@/lib/types";

export default async function SettingsPage() {
  const me = await getCurrentUser();
  // Not in the sidebar for anyone else, but guard the route itself too —
  // the backend would 403 the GET below anyway, this just avoids a broken
  // page if a non-admin lands here directly.
  if (me.role !== "admin") {
    redirect("/dashboard");
  }

  const schedule = await apiFetch<Schedule>("/settings/schedule");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Configuración</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Horario de la clínica</CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleForm action={updateScheduleAction} initialDays={schedule.days} />
        </CardContent>
      </Card>
    </div>
  );
}
