import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgendaCalendar } from "@/components/dashboard/agenda-calendar";
import { getMonthAppointmentsAction } from "@/lib/actions/appointments";
import { apiFetch } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { clinicDateInputValue, formatInClinicTimeZone } from "@/lib/clinic-time";
import { getPractitionerOptions } from "@/lib/practitioners";
import type { Patient, Schedule, TodayDashboard } from "@/lib/types";
import { stripHtml } from "@/lib/utils";

// The clinic's own calendar day, not the executing process's — this page
// renders server-side on Vercel (UTC), where reading the date directly off
// `new Date()` would show the wrong day/month right around midnight Madrid
// time.
function todayIso(): string {
  return clinicDateInputValue(new Date().toISOString());
}

function formatDateTime(iso: string): string {
  return formatInClinicTimeZone(iso, { dateStyle: "medium", timeStyle: "short" });
}

export default async function DashboardPage() {
  const date = todayIso();
  const [todayYear, todayMonth] = date.split("-").map(Number); // todayMonth is 1-12
  const [me, dashboard, monthAppointments, practitioners, schedule] = await Promise.all([
    getCurrentUser(),
    apiFetch<TodayDashboard>(`/dashboard/today?date=${date}`),
    // Feeds the calendar's initial month — see AgendaCalendar, which takes
    // over with its own fetches (getMonthAppointmentsAction) on navigation.
    getMonthAppointmentsAction(todayYear, todayMonth - 1),
    getPractitionerOptions(),
    // Read-only for every tenant role here too (see SettingsController) —
    // needed to color each day by occupancy, same as Agenda's calendar.
    apiFetch<Schedule>("/settings/schedule"),
  ]);

  // clinicalEntries is null (not just empty) for recepcion — that widget
  // doesn't render for that role at all, see below. The API only returns
  // patientId, not a name, so names are resolved here for display.
  const patientIds = Array.from(new Set((dashboard.clinicalEntries ?? []).map((e) => e.patientId)));
  const patients = await Promise.all(
    patientIds.map((id) => apiFetch<Patient>(`/patients/${id}`).catch(() => null)),
  );
  const patientById = new Map(
    patients.filter((p): p is Patient => p !== null).map((p) => [p.id, p]),
  );

  function patientName(patientId: string): string {
    const patient = patientById.get(patientId);
    return patient ? `${patient.firstName} ${patient.lastName}` : "—";
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Hola, {me.firstName}</h1>

      <AgendaCalendar
        initialYear={todayYear}
        initialMonth={todayMonth - 1}
        initialAppointments={monthAppointments}
        practitioners={practitioners}
        schedule={schedule}
      />

      {dashboard.clinicalEntries !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historia clínica de hoy</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.clinicalEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin entradas registradas hoy.</p>
            ) : (
              <ul className="divide-y">
                {dashboard.clinicalEntries.map((entry) => (
                  <li key={entry.id} className="py-2">
                    <Link
                      href={`/patients/${entry.patientId}/clinical-entries/${entry.id}`}
                      className="flex items-center justify-between gap-4 hover:underline"
                    >
                      <span className="text-sm">
                        {patientName(entry.patientId)} · {stripHtml(entry.chiefComplaint)}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(entry.visitDate)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
