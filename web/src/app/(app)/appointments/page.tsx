import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { InitialsAvatar } from '@/components/ui/initials-avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AppointmentPeriodView,
  type PeriodAppointment,
} from '@/components/appointments/appointment-period-view';
import { AppointmentRowActions } from '@/components/appointments/appointment-row-actions';
import { AppointmentStatusBadge } from '@/components/appointments/appointment-status-badge';
import { NewAppointmentDialog } from '@/components/appointments/new-appointment-dialog';
import { OccupancyCalendar } from '@/components/appointments/occupancy-calendar';
import { apiFetch } from '@/lib/api';
import { getMonthAppointmentsAction } from '@/lib/actions/appointments';
import { getCurrentUser } from '@/lib/auth';
import { parseDateKey, toDateKey } from '@/lib/calendar-grid';
import {
  clinicDateInputValue,
  clinicLocalToUtcIso,
  formatInClinicTimeZone,
} from '@/lib/clinic-time';
import { withHonorific } from '@/lib/doctor-name';
import { getPractitionerOptions } from '@/lib/practitioners';
import type {
  Appointment,
  AppointmentDefaults,
  Paginated,
  Patient,
  Schedule,
} from '@/lib/types';
import { cn, formatDocumentId, splitName } from '@/lib/utils';

const PAGE_SIZE = 20;
const PERIOD_PAGE_SIZE = 100;
type AgendaView = 'day' | 'week' | 'month';

function isDateKey(value?: string): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function addDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function startOfWeek(dateKey: string): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return toDateKey(date);
}

function rangeForView(
  view: AgendaView,
  anchor: string,
): { from: string; to: string } {
  if (view === 'day') return { from: anchor, to: anchor };
  if (view === 'week') {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }
  const date = parseDateKey(anchor);
  return {
    from: toDateKey(new Date(date.getFullYear(), date.getMonth(), 1)),
    to: toDateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  };
}

function shiftAnchor(view: AgendaView, anchor: string, delta: number): string {
  const date = parseDateKey(anchor);
  if (view === 'day') {
    date.setDate(date.getDate() + delta);
    return toDateKey(date);
  }
  if (view === 'week') {
    date.setDate(date.getDate() + delta * 7);
    return toDateKey(date);
  }
  const targetMonth = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  const targetLastDay = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth() + 1,
    0,
  ).getDate();
  return toDateKey(
    new Date(
      targetMonth.getFullYear(),
      targetMonth.getMonth(),
      Math.min(date.getDate(), targetLastDay),
    ),
  );
}

function formatPeriodLabel(view: AgendaView, from: string, to: string): string {
  if (view === 'day') {
    const value = parseDateKey(from).toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  if (view === 'week') {
    const start = parseDateKey(from);
    const end = parseDateKey(to);
    const startMonth = start.toLocaleDateString('es-ES', { month: 'short' });
    const endMonth = end.toLocaleDateString('es-ES', { month: 'short' });
    if (
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth()
    ) {
      return (
        start.getDate() +
        '–' +
        end.getDate() +
        ' ' +
        endMonth +
        ' ' +
        end.getFullYear()
      );
    }
    if (start.getFullYear() === end.getFullYear()) {
      return (
        start.getDate() +
        ' ' +
        startMonth +
        ' – ' +
        end.getDate() +
        ' ' +
        endMonth +
        ' ' +
        end.getFullYear()
      );
    }
    return (
      start.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }) +
      ' – ' +
      end.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    );
  }

  return parseDateKey(from).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
  });
}

function periodStartIso(dateKey: string): string {
  return clinicLocalToUtcIso(dateKey, '00:00');
}

function periodEndIso(dateKey: string): string {
  const end = new Date(clinicLocalToUtcIso(dateKey, '23:59'));
  end.setUTCSeconds(59, 999);
  return end.toISOString();
}

function formatDateTime(iso: string): string {
  return formatInClinicTimeZone(iso, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    date?: string;
    view?: string;
    page?: string;
    practitionerId?: string;
    openDay?: string;
  }>;
}) {
  const me = await getCurrentUser();
  if (me.role === 'profesional' && !me.agendaAccess) {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const todayKey = clinicDateInputValue(new Date().toISOString());
  const fromParam = isDateKey(params.from) ? params.from : undefined;
  const toParam = isDateKey(params.to) ? params.to : undefined;
  const dateParam = isDateKey(params.date) ? params.date : undefined;
  const validView =
    params.view === 'day' || params.view === 'week' || params.view === 'month'
      ? params.view
      : undefined;
  const view: AgendaView =
    validView ??
    (fromParam && toParam ? (fromParam === toParam ? 'day' : 'month') : 'day');
  const anchorKey = dateParam ?? fromParam ?? todayKey;
  const period = rangeForView(view, anchorKey);
  const { from, to } = period;
  const practitionerId = params.practitionerId;
  const page = Math.max(1, Math.floor(Number(params.page ?? '1') || 1));
  const pageSize = view === 'month' ? PAGE_SIZE : PERIOD_PAGE_SIZE;

  const query = new URLSearchParams();
  query.set('from', periodStartIso(from));
  query.set('to', periodEndIso(to));
  if (practitionerId) query.set('practitionerId', practitionerId);
  query.set('page', String(view === 'month' ? page : 1));
  query.set('pageSize', String(pageSize));

  const monthDate = parseDateKey(from);
  const [firstResult, [schedule, practitioners], monthData] = await Promise.all([
    apiFetch<Paginated<Appointment>>('/appointments?' + query.toString()),
    Promise.all([
      apiFetch<Schedule>('/settings/schedule'),
      getPractitionerOptions(),
    ]),
    view === 'month'
      ? Promise.all([
          apiFetch<AppointmentDefaults>('/settings/appointment-defaults'),
          getMonthAppointmentsAction(
            monthDate.getFullYear(),
            monthDate.getMonth(),
            practitionerId,
          ),
          getMonthAppointmentsAction(
            monthDate.getFullYear(),
            monthDate.getMonth(),
          ),
        ])
      : Promise.resolve(null),
  ]);
  let result = firstResult;

  // Day and week views render every appointment in the period. Fetch the
  // remaining API pages too, so a full clinic week does not silently stop at
  // the first 100 rows.
  if (view !== 'month' && result.total > result.data.length) {
    const pageCount = Math.ceil(result.total / result.pageSize);
    const remainingPages = await Promise.all(
      Array.from({ length: pageCount - 1 }, (_, index) => {
        const pageQuery = new URLSearchParams(query);
        pageQuery.set('page', String(index + 2));
        return apiFetch<Paginated<Appointment>>(
          '/appointments?' + pageQuery.toString(),
        );
      }),
    );
    result = {
      ...result,
      data: result.data.concat(
        ...remainingPages.map((pageResult) => pageResult.data),
      ),
      page: 1,
      pageSize: Math.max(1, result.total),
    };
  }

  const patientIds = Array.from(
    new Set(result.data.map((appointment) => appointment.patientId)),
  );
  const patientRecords = await Promise.all(
    patientIds.map((id) =>
      apiFetch<Patient>('/patients/' + id).catch(() => null),
    ),
  );
  const patientById = new Map(
    patientRecords
      .filter((patient): patient is Patient => patient !== null)
      .map((patient) => [patient.id, patient]),
  );
  const periodAppointments: PeriodAppointment[] = result.data.map(
    (appointment) => {
      const patient = patientById.get(appointment.patientId);
      return {
        id: appointment.id,
        patientName: patient
          ? patient.firstName + ' ' + patient.lastName
          : 'Paciente',
        scheduledAt: appointment.scheduledAt,
        durationMinutes: appointment.durationMinutes,
        status: appointment.status,
        practitionerId: appointment.practitionerId,
        practitionerName: appointment.practitionerName,
        practitionerHonorific: appointment.practitionerHonorific,
      };
    },
  );

  const appointmentDefaults = monthData?.[0] ?? null;
  const appointments = monthData?.[1] ?? [];
  const allAppointments = monthData?.[2] ?? [];

  const selectedDateKey = from === to ? from : undefined;
  const tabAnchorKey = dateParam ?? selectedDateKey ?? (view === 'month' ? todayKey : anchorKey);

  function periodHref(
    targetView: AgendaView,
    targetDate: string,
    targetPage = 1,
  ): string {
    const targetRange = rangeForView(targetView, targetDate);
    const search = new URLSearchParams();
    search.set('view', targetView);
    search.set('date', targetDate);
    search.set('from', targetRange.from);
    search.set('to', targetRange.to);
    if (practitionerId) search.set('practitionerId', practitionerId);
    if (targetPage > 1) search.set('page', String(targetPage));
    return '/appointments?' + search.toString();
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const weekStart = startOfWeek(anchorKey);
  const weekDateKeys = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Agenda</h1>
        {view === 'month' && (
          <NewAppointmentDialog practitioners={practitioners} />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-2">
        <nav
          aria-label="Vista de agenda"
          className="flex items-center gap-1 rounded-full bg-muted p-1"
        >
          {(['day', 'week', 'month'] as const).map((targetView) => (
            <Link
              key={targetView}
              href={periodHref(targetView, tabAnchorKey)}
              aria-current={view === targetView ? 'page' : undefined}
              className={cn(
                'rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
                view === targetView
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {targetView === 'day'
                ? 'Día'
                : targetView === 'week'
                  ? 'Semana'
                  : 'Mes'}
            </Link>
          ))}
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon-sm" asChild>
            <Link
              href={periodHref(view, shiftAnchor(view, anchorKey, -1))}
              aria-label={
                view === 'day'
                  ? 'Día anterior'
                  : view === 'week'
                    ? 'Semana anterior'
                    : 'Mes anterior'
              }
            >
              <ChevronLeftIcon />
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={periodHref(view, todayKey)}>Hoy</Link>
          </Button>
          <Button variant="outline" size="icon-sm" asChild>
            <Link
              href={periodHref(view, shiftAnchor(view, anchorKey, 1))}
              aria-label={
                view === 'day'
                  ? 'Día siguiente'
                  : view === 'week'
                    ? 'Semana siguiente'
                    : 'Mes siguiente'
              }
            >
              <ChevronRightIcon />
            </Link>
          </Button>

          <form
            action="/appointments"
            method="get"
            className="flex items-center gap-2"
          >
            <input type="hidden" name="view" value={view} />
            {practitionerId && (
              <input
                type="hidden"
                name="practitionerId"
                value={practitionerId}
              />
            )}
            <label htmlFor="agenda-date" className="sr-only">
              Ir a la fecha
            </label>
            <input
              id="agenda-date"
              key={anchorKey}
              type="date"
              name="date"
              defaultValue={anchorKey}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            />
            <Button type="submit" variant="outline" size="sm">
              Ir
            </Button>
          </form>
        </div>
      </div>

      {view === 'month' ? (
        <>
          <OccupancyCalendar
            year={parseDateKey(from).getFullYear()}
            month={parseDateKey(from).getMonth()}
            appointments={appointments}
            allAppointments={allAppointments}
            schedule={schedule}
            selectedDateKey={selectedDateKey}
            practitioners={practitioners}
            from={from}
            to={to}
            practitionerId={practitionerId}
            defaultDurationMinutes={
              appointmentDefaults?.defaultDurationMinutes ?? 30
            }
            initialOpenDayKey={params.openDay}
          />

          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Fecha y hora</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Profesional</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.data.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground"
                    >
                      No hay citas en este rango.
                    </TableCell>
                  </TableRow>
                )}
                {result.data.map((appointment) => {
                  const patient = patientById.get(appointment.patientId);
                  const practitionerName = appointment.practitionerName;
                  return (
                    <TableRow key={appointment.id}>
                      <TableCell>
                        {patient ? (
                          <div className="flex items-center gap-3">
                            <InitialsAvatar
                              firstName={patient.firstName}
                              lastName={patient.lastName}
                              size="sm"
                            />
                            <div>
                              <div className="font-medium">
                                <Link
                                  href={'/patients/' + patient.id}
                                  className="hover:underline"
                                >
                                  {patient.firstName} {patient.lastName}
                                </Link>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatDocumentId(patient.documentId)}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={'/appointments/' + appointment.id}
                          className="hover:underline"
                        >
                          {formatDateTime(appointment.scheduledAt)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <AppointmentStatusBadge status={appointment.status} />
                      </TableCell>
                      <TableCell>
                        {practitionerName ? (
                          <div className="flex items-center gap-3">
                            <InitialsAvatar
                              {...splitName(practitionerName)}
                              size="sm"
                              variant="doctor"
                            />
                            {withHonorific(
                              practitionerName,
                              appointment.practitionerHonorific,
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <AppointmentRowActions
                          appointment={appointment}
                          practitioners={practitioners}
                          canDelete={
                            me.role === 'admin' || me.role === 'recepcion'
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Página {result.page} de {totalPages}
              </span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={periodHref('month', anchorKey, page - 1)}>
                      Anterior
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Anterior
                  </Button>
                )}
                {page < totalPages ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={periodHref('month', anchorKey, page + 1)}>
                      Siguiente
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Siguiente
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <AppointmentPeriodView
          view={view}
          dateKey={anchorKey}
          todayKey={todayKey}
          periodLabel={formatPeriodLabel(view, from, to)}
          weekDateKeys={weekDateKeys}
          appointments={periodAppointments}
          schedule={schedule}
          practitioners={practitioners}
          practitionerId={practitionerId}
        />
      )}
    </div>
  );
}
