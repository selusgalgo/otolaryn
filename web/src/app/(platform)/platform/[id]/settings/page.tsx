import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleForm } from "@/components/settings/schedule-form";
import { updateTenantScheduleAction } from "@/lib/actions/platform";
import { apiFetch } from "@/lib/api";
import type { TenantSchedule } from "@/lib/types";

export default async function TenantSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const schedule = await apiFetch<TenantSchedule>(`/platform/tenants/${id}/schedule`);
  const action = updateTenantScheduleAction.bind(null, id);

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
          <ScheduleForm action={action} initialOpenDays={schedule.openDays} />
        </CardContent>
      </Card>
    </div>
  );
}
