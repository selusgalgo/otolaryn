import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClinicProfileForm } from "@/components/settings/clinic-profile-form";
import { updateClinicProfileAction } from "@/lib/actions/settings";
import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import type { ClinicProfile } from "@/lib/types";

export default async function ClinicProfileSettingsPage() {
  const me = await getCurrentUser();
  if (me.role !== "admin") {
    redirect("/dashboard");
  }

  const profile = await apiFetch<ClinicProfile>("/settings/clinic-profile");

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
        <h1 className="mt-2 text-2xl font-bold">Perfil de la clínica</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identidad en los PDF exportados</CardTitle>
        </CardHeader>
        <CardContent>
          <ClinicProfileForm action={updateClinicProfileAction} initialProfile={profile} />
        </CardContent>
      </Card>
    </div>
  );
}
