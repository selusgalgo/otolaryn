import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeviceLockForm } from "@/components/settings/device-lock-form";
import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import type { DeviceLock } from "@/lib/types";

export default async function SecuritySettingsPage() {
  const me = await getCurrentUser();
  if (me.role !== "admin") {
    redirect("/dashboard");
  }

  const deviceLock = await apiFetch<DeviceLock>("/settings/device-lock");

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
        <h1 className="mt-2 text-2xl font-bold">Seguridad</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dispositivos autorizados</CardTitle>
        </CardHeader>
        <CardContent>
          <DeviceLockForm initialDeviceLock={deviceLock} />
        </CardContent>
      </Card>
    </div>
  );
}
