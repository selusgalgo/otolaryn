import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppointmentDefaultsForm } from "@/components/settings/appointment-defaults-form";
import { ClinicProfileForm } from "@/components/settings/clinic-profile-form";
import { ScheduleForm } from "@/components/settings/schedule-form";
import { WhatsappPlatformForm } from "@/components/settings/whatsapp-booking-form";
import { ConsultationTemplateForm } from "@/components/platform/consultation-template-form";
import type {
  ConsultationField,
  ConsultationTemplate,
} from "@/lib/consultation-template";
import {
  updateTenantAppointmentDefaultsAction,
  updateTenantClinicProfileAction,
  updateTenantConsultationTemplateAction,
  updateTenantScheduleAction,
  updateTenantWhatsappPlatformAction,
} from "@/lib/actions/platform";
import { apiFetch } from "@/lib/api";
import type {
  ClinicProfile,
  TenantAppointmentDefaults,
  TenantSchedule,
  WhatsappBookingSettings,
} from "@/lib/types";

export default async function TenantSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [
    schedule,
    appointmentDefaults,
    clinicProfile,
    whatsapp,
    consultationTemplate,
  ] = await Promise.all([
    apiFetch<TenantSchedule>(`/platform/tenants/${id}/schedule`),
    apiFetch<TenantAppointmentDefaults>(
      `/platform/tenants/${id}/appointment-defaults`,
    ),
    apiFetch<ClinicProfile>(`/platform/tenants/${id}/clinic-profile`),
    apiFetch<WhatsappBookingSettings>(
      `/platform/tenants/${id}/whatsapp-booking`,
    ),
    apiFetch<{ template: ConsultationTemplate; fields: ConsultationField[] }>(
      `/platform/tenants/${id}/consultation-template`,
    ),
  ]);
  const scheduleAction = updateTenantScheduleAction.bind(null, id);
  const appointmentDefaultsAction = updateTenantAppointmentDefaultsAction.bind(
    null,
    id,
  );
  const clinicProfileAction = updateTenantClinicProfileAction.bind(null, id);

  return (
    <div className="space-y-4">
      <Link
        href="/platform"
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Clínicas
      </Link>
      <h1 className="text-2xl font-bold">
        Configuración — {schedule.tenantName}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reservas por WhatsApp</CardTitle>
        </CardHeader>
        <CardContent>
          <WhatsappPlatformForm
            action={updateTenantWhatsappPlatformAction.bind(null, id)}
            enabled={whatsapp.platformEnabled}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Perfil de la clínica</CardTitle>
        </CardHeader>
        <CardContent>
          <ClinicProfileForm
            action={clinicProfileAction}
            initialProfile={clinicProfile}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plantilla de consulta</CardTitle>
        </CardHeader>
        <CardContent>
          <ConsultationTemplateForm
            action={updateTenantConsultationTemplateAction.bind(null, id)}
            initialTemplate={consultationTemplate.template}
            initialFields={consultationTemplate.fields}
          />
        </CardContent>
      </Card>

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
            initialDefaultDurationMinutes={
              appointmentDefaults.defaultDurationMinutes
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
