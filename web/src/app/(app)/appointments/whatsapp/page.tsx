import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { formatInClinicTimeZone } from '@/lib/clinic-time';

type Activity = {
  events: {
    id: string;
    appointmentId: string;
    kind: 'booked' | 'cancelled' | 'rescheduled';
    occurredAt: string;
    unread: boolean;
  }[];
  reminders: {
    appointmentId: string;
    scheduledAt: string;
    attemptedAt: string;
    status: 'sending' | 'accepted' | 'failed' | 'uncertain';
  }[];
  deliveryIssues: {
    messageHash: string;
    createdAt: string;
    status: 'pending' | 'claimed' | 'uncertain';
  }[];
};
const eventLabels = {
  booked: 'Reserva',
  cancelled: 'Cancelación',
  rescheduled: 'Cambio de cita',
};
const reminderLabels = {
  sending: 'Pendiente de confirmación',
  accepted: 'Aceptado por Meta',
  failed: 'Rechazado',
  uncertain: 'Resultado sin confirmar',
};
const issueLabels = {
  pending: 'Envío pendiente',
  claimed: 'Envío sin confirmar',
  uncertain: 'Resultado sin confirmar',
};
const format = (date: string) =>
  formatInClinicTimeZone(date, { dateStyle: 'medium', timeStyle: 'short' });

async function acknowledge(id: string) {
  'use server';
  await apiFetch(
    `/whatsapp-booking/activity/${encodeURIComponent(id)}/acknowledge`,
    { method: 'PATCH' },
  );
  revalidatePath('/appointments/whatsapp');
  revalidatePath('/appointments');
}

export default async function WhatsappActivityPage() {
  const user = await getCurrentUser();
  if (user.role !== 'admin' && user.role !== 'recepcion')
    redirect('/appointments');
  if (!(await apiFetch<{ enabled: boolean }>('/whatsapp-booking/feature-status')).enabled)
    redirect('/appointments');
  const { events, reminders, deliveryIssues } = await apiFetch<Activity>(
    '/whatsapp-booking/activity',
  );
  return (
    <main className="space-y-6">
      <Link href="/appointments" className="text-sm text-muted-foreground">
        Volver a la agenda
      </Link>
      <h1 className="text-2xl font-bold">Actividad de WhatsApp</h1>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Reservas y avisos a recepción</h2>
        {!events.length && (
          <p className="text-sm text-muted-foreground">
            Todavía no hay actividad.
          </p>
        )}
        <ul className="divide-y">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center gap-3 py-3 text-sm"
            >
              <Link
                href={`/appointments/${event.appointmentId}`}
                className="font-medium underline"
              >
                {eventLabels[event.kind]}
              </Link>
              <time dateTime={event.occurredAt}>
                {format(event.occurredAt)}
              </time>
              {event.unread && (
                <form action={acknowledge.bind(null, event.id)}>
                  <Button type="submit" variant="outline" size="sm">
                    Marcar como leído
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Recordatorios</h2>
        {!reminders.length && (
          <p className="text-sm text-muted-foreground">
            Todavía no hay intentos de envío.
          </p>
        )}
        <ul className="divide-y">
          {reminders.map((reminder) => (
            <li
              key={`${reminder.appointmentId}-${reminder.scheduledAt}`}
              className="py-3 text-sm"
            >
              <Link
                href={`/appointments/${reminder.appointmentId}`}
                className="underline"
              >
                Cita del {format(reminder.scheduledAt)}
              </Link>
              {' · '}
              {reminderLabels[reminder.status]}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          Mensajes que requieren revisión
        </h2>
        {!deliveryIssues.length && (
          <p className="text-sm text-muted-foreground">
            No hay incidencias recientes.
          </p>
        )}
        <ul className="divide-y">
          {deliveryIssues.map((issue) => (
            <li key={issue.messageHash} className="py-3 text-sm">
              {issueLabels[issue.status]} · {format(issue.createdAt)}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
