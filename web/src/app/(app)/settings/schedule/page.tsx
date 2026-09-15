import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleForm } from "@/components/settings/schedule-form";
import { updateScheduleAction } from "@/lib/actions/settings";
import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import type { Schedule } from "@/lib/types";

export default async function ScheduleSettingsPage() {
  const me = await getCurrentUser();
  if (me.role !== "admin") {
    redirect("/dashboard");
  }

  const schedule = await apiFetch<Schedule>("/settings/schedule");

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
        <h1 className="mt-2 text-2xl font-bold">Horario de la clínica</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Días y tramos horarios</CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleForm action={updateScheduleAction} initialDays={schedule.days} />
        </CardContent>
      </Card>
    </div>
  );
}
