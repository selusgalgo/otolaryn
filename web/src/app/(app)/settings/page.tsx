import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AntecedenteCategoryCard } from "@/components/settings/antecedente-category-card";
import { AntecedenteTypesForm } from "@/components/settings/antecedente-types-form";
import { AppointmentDefaultsForm } from "@/components/settings/appointment-defaults-form";
import { ClinicProfileForm } from "@/components/settings/clinic-profile-form";
import { DeviceLockForm } from "@/components/settings/device-lock-form";
import { InsuranceEntitiesForm } from "@/components/settings/insurance-entities-form";
import { ScheduleForm } from "@/components/settings/schedule-form";
import { SettingsSection } from "@/components/settings/settings-section";
import {
  updateAppointmentDefaultsAction,
  updateClinicProfileAction,
  updateScheduleAction,
} from "@/lib/actions/settings";
import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import type {
  AntecedenteType,
  AppointmentDefaults,
  ClinicProfile,
  DeviceLock,
  InsuranceEntity,
  Schedule,
} from "@/lib/types";

// Every Configuración block on one scrolling page (the side menu in
// layout.tsx jumps between them). Each block keeps its own form and its
// own save — nothing waits for a single "Guardar" at the bottom.
export default async function SettingsPage() {
  // Checked here too, not only in layout.tsx: layout and page render in
  // parallel, so the page must not start fetching for a non-admin.
  const me = await getCurrentUser();
  if (me.role !== "admin") {
    redirect("/dashboard");
  }

  const [profile, schedule, appointmentDefaults, antecedenteTypes, insuranceEntities, deviceLock] =
    await Promise.all([
      apiFetch<ClinicProfile>("/settings/clinic-profile"),
      apiFetch<Schedule>("/settings/schedule"),
      apiFetch<AppointmentDefaults>("/settings/appointment-defaults"),
      apiFetch<AntecedenteType[]>("/antecedente-types"),
      apiFetch<InsuranceEntity[]>("/insurance-entities"),
      apiFetch<DeviceLock>("/settings/device-lock"),
    ]);
  const personalTypes = antecedenteTypes.filter((t) => t.category === "personal");
  const familiarTypes = antecedenteTypes.filter((t) => t.category === "familiar");

  return (
    <div className="space-y-12">
      <SettingsSection id="clinic-profile">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identidad en los PDF exportados</CardTitle>
          </CardHeader>
          <CardContent>
            <ClinicProfileForm action={updateClinicProfileAction} initialProfile={profile} />
          </CardContent>
        </Card>
      </SettingsSection>

      <SettingsSection id="schedule">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Días y tramos horarios</CardTitle>
          </CardHeader>
          <CardContent>
            <ScheduleForm action={updateScheduleAction} initialDays={schedule.days} />
          </CardContent>
        </Card>
      </SettingsSection>

      <SettingsSection id="appointments">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Duración de las citas</CardTitle>
          </CardHeader>
          <CardContent>
            <AppointmentDefaultsForm
              action={updateAppointmentDefaultsAction}
              initialDefaultDurationMinutes={appointmentDefaults.defaultDurationMinutes}
            />
          </CardContent>
        </Card>
      </SettingsSection>

      <SettingsSection id="antecedentes">
        <div className="grid gap-4 md:grid-cols-2">
          <AntecedenteCategoryCard title="Antecedentes personales">
            <AntecedenteTypesForm category="personal" initialTypes={personalTypes} />
          </AntecedenteCategoryCard>
          <AntecedenteCategoryCard title="Antecedentes familiares">
            <AntecedenteTypesForm category="familiar" initialTypes={familiarTypes} />
          </AntecedenteCategoryCard>
        </div>
      </SettingsSection>

      <SettingsSection id="insurance">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aseguradoras</CardTitle>
          </CardHeader>
          <CardContent>
            <InsuranceEntitiesForm initialEntities={insuranceEntities} />
          </CardContent>
        </Card>
      </SettingsSection>

      <SettingsSection id="security">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dispositivos autorizados</CardTitle>
          </CardHeader>
          <CardContent>
            <DeviceLockForm initialDeviceLock={deviceLock} />
          </CardContent>
        </Card>
      </SettingsSection>
    </div>
  );
}
