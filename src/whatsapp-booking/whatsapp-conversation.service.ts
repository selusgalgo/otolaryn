import { ConflictException, HttpException, Injectable } from '@nestjs/common';
import { isDateString } from 'class-validator';
import { createHash } from 'node:crypto';
import { TenancyContext } from '../tenancy/tenancy-context';
import { InboundMessageDto } from './whatsapp-booking.dto';
import { WhatsappBookingService } from './whatsapp-booking.service';

type Professional = { id: string; firstName: string; lastName: string };
type Slot = { scheduledAt: string; durationMinutes: number };
type Menu = {
  kind: 'professionals' | 'slots';
  options: { id: string; title: string }[];
  hasMore?: boolean;
};
const storedMenuPrefix = 'WA_MENU_V1:';
interface State {
  step:
    | 'professional'
    | 'date'
    | 'slot'
    | 'firstName'
    | 'lastName'
    | 'dob'
    | 'confirm';
  professionals?: Professional[];
  practitionerId?: string;
  practitionerName?: string;
  date?: string;
  slots?: Slot[];
  slotPage?: number;
  scheduledAt?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
}

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const menuChoice = (value: string, length: number): number => {
  if (!/^\d{1,2}$/.test(value)) return -1;
  const index = Number(value) - 1;
  return index >= 0 && index < length ? index : -1;
};
const formatSlot = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
const slotMenu = (slots: Slot[], page: number): string =>
  'Elige un horario escribiendo su número:\n' +
  slots
    .slice(page * 8, page * 8 + 8)
    .map((s, i) => `${i + 1}. ${formatSlot(s.scheduledAt)}`)
    .join('\n') +
  (slots.length > (page + 1) * 8
    ? '\nEscribe MAS para ver otros horarios.'
    : '') +
  '\nEscribe FECHA para elegir otro día.';
const slotChoices = (slots: Slot[], page: number, practitionerId: string): Menu => ({
  kind: 'slots',
  options: slots.slice(page * 8, page * 8 + 8).map((slot) => ({
    id: `S:${practitionerId}:${slot.scheduledAt}`,
    title: formatSlot(slot.scheduledAt),
  })),
  hasMore: slots.length > (page + 1) * 8,
});

@Injectable()
export class WhatsappConversationService {
  constructor(
    private readonly context: TenancyContext,
    private readonly booking: WhatsappBookingService,
  ) {}

  async process(
    message: InboundMessageDto,
  ): Promise<{ reply: string; duplicate: boolean; menu?: Menu }> {
    const tenantId = this.context.tenantId;
    const phoneHash = hash(message.phone);
    const messageHash = hash(message.messageId);
    const contentHash = hash(`${message.phone}\n${message.text}`);
    const manager = this.context.manager;
    // Lock message first, then conversation, so simultaneous deliveries and
    // messages from the same phone cannot race or create duplicate bookings.
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`wa-message:${tenantId}:${messageHash}`],
    );
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`wa-session:${tenantId}:${phoneHash}`],
    );
    const receipts = await manager.query<
      { phone_hash: string; content_hash: string; reply: string }[]
    >(
      'SELECT phone_hash, content_hash, reply FROM public.whatsapp_booking_receipts WHERE message_hash = $1',
      [messageHash],
    );
    if (receipts.length) {
      if (
        receipts[0].phone_hash !== phoneHash ||
        receipts[0].content_hash !== contentHash
      ) {
        throw new ConflictException('Identificador de mensaje ya utilizado');
      }
      if (receipts[0].reply.startsWith(storedMenuPrefix)) {
        const stored = JSON.parse(receipts[0].reply.slice(storedMenuPrefix.length)) as { reply: string; menu: Menu };
        return { ...stored, duplicate: true };
      }
      return { reply: receipts[0].reply, duplicate: true };
    }
    // Expired state is also cleaned here so it cannot be reused between
    // periodic purge runs.
    await manager.query(
      "DELETE FROM public.whatsapp_booking_sessions WHERE phone_hash = $1 AND updated_at < now() - interval '30 minutes'",
      [phoneHash],
    );
    await manager.query(
      "DELETE FROM public.whatsapp_booking_receipts WHERE phone_hash = $1 AND created_at < now() - interval '24 hours'",
      [phoneHash],
    );
    const rows = await manager.query<{ state: State }[]>(
      'SELECT state FROM public.whatsapp_booking_sessions WHERE phone_hash = $1',
      [phoneHash],
    );
    const text = message.text.trim();
    let state: State | undefined = rows[0]?.state;
    let reply: string;
    let menu: Menu | undefined;
    if (/^(cancelar|salir)$/i.test(text)) {
      state = undefined;
      reply =
        'He cancelado el proceso. Escribe CITA cuando quieras empezar de nuevo.';
    } else if (!state) {
      const professionals = await this.booking.practitioners();
      if (!professionals.length) {
        reply =
          'No hay profesionales disponibles para reserva automática. Contacta con recepción.';
      } else {
        state = { step: 'professional', professionals };
        reply =
          'Para reservar una cita, elige profesional escribiendo el número:\n' +
          professionals
            .map((p, i) => `${i + 1}. ${p.firstName} ${p.lastName}`)
            .join('\n') +
          '\nEscribe CANCELAR para salir.';
        menu = {
          kind: 'professionals',
          options: professionals.map((p) => ({ id: `P:${p.id}`, title: `${p.firstName} ${p.lastName}` })),
        };
      }
    } else if (state.step === 'professional') {
      const professionals = state.professionals ?? [];
      const index = text.startsWith('P:')
        ? professionals.findIndex((p) => text === `P:${p.id}`)
        : menuChoice(text, professionals.length);
      if (index < 0)
        reply =
          'Indica el número del profesional mostrado, o escribe CANCELAR.';
      else {
        const person = state.professionals![index];
        state = {
          step: 'date',
          practitionerId: person.id,
          practitionerName: `${person.firstName} ${person.lastName}`,
        };
        reply =
          'Indica la fecha deseada en formato AAAA-MM-DD, dentro de los próximos 30 días.';
      }
    } else if (state.step === 'date') {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
        !isDateString(text, { strict: true })
      ) {
        reply = 'Indica una fecha válida en formato AAAA-MM-DD.';
      } else {
        try {
          const slots = await this.booking.slots({
            practitionerId: state.practitionerId!,
            date: text,
          });
          if (!slots.length)
            reply =
              'No hay huecos para ese día. Indica otra fecha en formato AAAA-MM-DD.';
          else {
            state = { ...state, step: 'slot', date: text, slots, slotPage: 0 };
            reply = slotMenu(slots, 0);
            menu = slotChoices(slots, 0, state.practitionerId!);
          }
        } catch (err) {
          if (!(err instanceof HttpException) || err.getStatus() >= 500)
            throw err;
          reply =
            'No puedo ofrecer esa fecha. Indica otra dentro de los próximos 30 días, en formato AAAA-MM-DD.';
        }
      }
    } else if (state.step === 'slot') {
      const slots = state.slots ?? [];
      const page = state.slotPage ?? 0;
      const practitionerId = state.practitionerId;
      const pageSlots = slots.slice(page * 8, page * 8 + 8);
      const index = text.startsWith('S:')
        ? pageSlots.findIndex((slot) => text === `S:${practitionerId}:${slot.scheduledAt}`)
        : menuChoice(text, pageSlots.length);
      if (/^fecha$/i.test(text)) {
        state = {
          step: 'date',
          practitionerId: state.practitionerId,
          practitionerName: state.practitionerName,
        };
        reply = 'Indica otra fecha en formato AAAA-MM-DD.';
      } else if (/^m[aá]s$/i.test(text) && slots.length > (page + 1) * 8) {
        state = { ...state, slotPage: page + 1 };
        reply = slotMenu(slots, page + 1);
        menu = slotChoices(slots, page + 1, state.practitionerId!);
      } else if (index < 0)
        reply =
          'Indica el número de uno de los horarios mostrados, FECHA o CANCELAR.';
      else {
        state = {
          ...state,
          step: 'firstName',
          scheduledAt: slots[page * 8 + index].scheduledAt,
          slots: undefined,
          slotPage: undefined,
        };
        reply = 'Indica tu nombre.';
      }
    } else if (state.step === 'firstName' || state.step === 'lastName') {
      if (!text || text.length > 100)
        reply = 'Indica un nombre o apellido válido de hasta 100 caracteres.';
      else if (state.step === 'firstName') {
        state = { ...state, firstName: text, step: 'lastName' };
        reply = 'Indica tus apellidos.';
      } else {
        state = { ...state, lastName: text, step: 'dob' };
        reply = 'Indica tu fecha de nacimiento en formato AAAA-MM-DD.';
      }
    } else if (state.step === 'dob') {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
        !isDateString(text, { strict: true }) ||
        text > new Date().toISOString().slice(0, 10)
      ) {
        reply = 'Indica una fecha de nacimiento válida en formato AAAA-MM-DD.';
      } else {
        state = { ...state, dateOfBirth: text, step: 'confirm' };
        reply = `¿Confirmas la reserva con ${state.practitionerName} para el ${formatSlot(state.scheduledAt!)}? Responde SI para reservar o CANCELAR para salir.`;
      }
    } else {
      if (!/^(si|sí)$/i.test(text))
        reply = 'Responde SI para reservar o CANCELAR para salir.';
      else {
        // An overlap is a database error; roll back to a savepoint before
        // recording the human-readable response in the surrounding transaction.
        await manager.query('SAVEPOINT whatsapp_booking_attempt');
        try {
          const result = await this.booking.book(
            {
              practitionerId: state.practitionerId!,
              scheduledAt: state.scheduledAt!,
              firstName: state.firstName!,
              lastName: state.lastName!,
              dateOfBirth: state.dateOfBirth!,
              phone: message.phone,
            },
            `wa:${messageHash}`,
          );
          await manager.query('RELEASE SAVEPOINT whatsapp_booking_attempt');
          reply =
            result.status === 'scheduled'
              ? `Tu cita con ${state.practitionerName} está reservada para el ${formatSlot(result.scheduledAt.toISOString())}. Referencia: ${result.id}.`
              : 'La cita ya no está programada. Contacta con recepción.';
          state = undefined;
        } catch (err) {
          await manager.query('ROLLBACK TO SAVEPOINT whatsapp_booking_attempt');
          await manager.query('RELEASE SAVEPOINT whatsapp_booking_attempt');
          if (!(err instanceof HttpException) || err.getStatus() >= 500)
            throw err;
          reply =
            'No se ha podido confirmar la cita. Puede que el horario ya esté ocupado o que recepción deba revisar tus datos. Contacta con la clínica.';
          state = undefined;
        }
      }
    }
    if (state) {
      await manager.query(
        `INSERT INTO public.whatsapp_booking_sessions (tenant_id, phone_hash, state)
        VALUES ($1, $2, $3::jsonb) ON CONFLICT (tenant_id, phone_hash)
        DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
        [tenantId, phoneHash, JSON.stringify(state)],
      );
    } else {
      await manager.query(
        'DELETE FROM public.whatsapp_booking_sessions WHERE phone_hash = $1',
        [phoneHash],
      );
    }
    await manager.query(
      'INSERT INTO public.whatsapp_booking_receipts (tenant_id, message_hash, phone_hash, content_hash, reply) VALUES ($1, $2, $3, $4, $5)',
      [tenantId, messageHash, phoneHash, contentHash, menu ? storedMenuPrefix + JSON.stringify({ reply, menu }) : reply],
    );
    return { reply, ...(menu ? { menu } : {}), duplicate: false };
  }
}
