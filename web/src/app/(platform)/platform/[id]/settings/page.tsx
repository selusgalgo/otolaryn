import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppointmentDefaultsForm } from "@/components/settings/appointment-defaults-form";
import { ScheduleForm } from "@/components/settings/schedule-form";
import { updateTenantAppointmentDefaultsAction, updateTenantScheduleAction } from "@/lib/actions/platform";
import { apiFetch } from "@/lib/api";
import type { TenantAppointmentDefaults, TenantSchedule } from "@/lib/types";

export default async function TenantSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [schedule, appointmentDefaults] = await Promise.all([
    apiFetch<TenantSchedule>(`/platform/tenants/${id}/schedule`),
    apiFetch<TenantAppointmentDefaults>(`/platform/tenants/${id}/appointment-defaults`),
  ]);
  const scheduleAction = updateTenantScheduleAction.bind(null, id);
  const appointmentDefaultsAction = updateTenantAppointmentDefaultsAction.bind(null, id);

  return (
    <div className="space-y-4">
      <Link href="/platform" className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        Clínicas
      </Link>
      <h1 className="text-2xl font-bold">Configuración — {schedule.tenantName}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Horario de la clínica</CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleForm action={scheduleAction} initialDays={schedule.days} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Duración de las citas</CardTitle>
        </CardHeader>
        <CardContent>
          <AppointmentDefaultsForm
            action={appointmentDefaultsAction}
            initialDefaultDurationMinutes={appointmentDefaults.defaultDurationMinutes}
          />
        </CardContent>
      </Card>
    </div>
  );
}
