import { ConflictException, HttpException, Injectable } from '@nestjs/common';
import { isDateString } from 'class-validator';
import { createHash } from 'node:crypto';
import { TenancyContext } from '../tenancy/tenancy-context';
import { InboundMessageDto } from './whatsapp-booking.dto';
import { WhatsappBookingService } from './whatsapp-booking.service';

type Professional = { id: string; firstName: string; lastName: string };
type Slot = { scheduledAt: string; durationMinutes: number };
type Menu = {
  kind: 'professionals' | 'slots' | 'dates' | 'confirm' | 'main' | 'another';
  options: { id: string; title: string }[];
  hasMore?: boolean;
  hasPrevious?: boolean;
};
const storedMenuPrefix = 'WA_MENU_V1:';
interface State {
  step:
    | 'visitType'
    | 'professional'
    | 'date'
    | 'slot'
    | 'firstName'
    | 'lastName'
    | 'dob'
    | 'reason'
    | 'reminder'
    | 'cancelDob'
    | 'cancelName'
    | 'cancelPick'
    | 'cancelConfirm'
    | 'confirm'
    | 'another';
  professionals?: Professional[];
  visitTypeId?: string;
  visitTypes?: { id: string; name: string }[];
  rescheduling?: boolean;
  original?: { id: string; scheduledAt: string };

  practitionerId?: string;
  practitionerName?: string;
  date?: string;
  dateOptions?: string[];
  datePage?: number;
  slots?: Slot[];
  slotPage?: number;
  scheduledAt?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  reason?: string;
  reminderOptIn?: boolean;
  appointments?: {
    id: string;
    scheduledAt: string;
    practitionerName: string;
    visitTypeId?: string;
  }[];
  cancellationId?: string;
  cancellationName?: string;
  reuseIdentity?: boolean;
}

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const reminderPrompt =
  '¿Quieres recibir un recordatorio de esta cita por WhatsApp? Escribe SI o NO.';
const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
const isStartCommand = (value: string) =>
  /^(cita|nueva cita|reservar( una)? cita|quiero (una )?cita|empezar( de nuevo)?|iniciar|volver a empezar)$/i.test(
    normalizeText(value),
  );
const isCancelCommand = (value: string) =>
  /^(cancelar|anular|salir|mejor no|no seguir)$/i.test(normalizeText(value));
const menuChoice = (value: string, length: number): number => {
  const normalized = normalizeText(value).replace(/^(opcion|numero)\s+/, '');
  const wordChoices = new Map([
    ['primero', 1],
    ['primera', 1],
    ['uno', 1],
    ['una', 1],
    ['segundo', 2],
    ['segunda', 2],
    ['dos', 2],
    ['tercero', 3],
    ['tercera', 3],
    ['tres', 3],
    ['cuarto', 4],
    ['cuarta', 4],
    ['cuatro', 4],
    ['quinto', 5],
    ['quinta', 5],
    ['cinco', 5],
    ['sexto', 6],
    ['sexta', 6],
    ['seis', 6],
    ['septimo', 7],
    ['septima', 7],
    ['siete', 7],
    ['octavo', 8],
    ['octava', 8],
    ['ocho', 8],
  ]);
  const ordinal = wordChoices.get(normalized.replace(/^(el|la)\s+/, ''));
  const digits = /^\d{1,2}$/.test(normalized) ? Number(normalized) : ordinal;
  if (!digits) return -1;
  const index = digits - 1;
  return index >= 0 && index < length ? index : -1;
};
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('es-ES', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00Z`));
const formatSlot = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
const localDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const addCalendarDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const birthDate = (value: string) => {
  const text = value.trim();
  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!match) return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  const [, day, month, year] = match;
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return isDateString(iso, { strict: true }) ? iso : '';
};
const naturalDate = (value: string, available: string[]) => {
  const normalized = normalizeText(value)
    .replace(/^(me viene bien|mejor|prefiero|para|quiero)\s+/, '')
    .replace(/^(el|este|la|proximo|proxima)\s+/, '')
    .replace(/\s+(que viene|proximo|proxima)$/, '');
  const iso = normalized.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (iso && available.includes(iso)) return iso;
  const numeric = normalized.match(
    /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/,
  );
  if (numeric) {
    const [, day, month, suppliedYear] = numeric;
    const today = localDate(new Date());
    let year = suppliedYear ?? today.slice(0, 4);
    let candidate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    if (!suppliedYear && candidate < today) {
      year = String(Number(year) + 1);
      candidate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    if (
      isDateString(candidate, { strict: true }) &&
      available.includes(candidate)
    )
      return candidate;
  }
  const today = localDate(new Date());
  if (normalized === 'hoy' && available.includes(today)) return today;
  if (normalized === 'manana' || normalized.startsWith('manana ')) {
    const tomorrow = addCalendarDays(today, 1);
    if (available.includes(tomorrow)) return tomorrow;
  }
  if (
    normalized === 'pasado manana' ||
    normalized.startsWith('pasado manana ')
  ) {
    const dayAfterTomorrow = addCalendarDays(today, 2);
    if (available.includes(dayAfterTomorrow)) return dayAfterTomorrow;
  }
  const weekdays = [
    'domingo',
    'lunes',
    'martes',
    'miercoles',
    'jueves',
    'viernes',
    'sabado',
  ];
  const weekday = weekdays.find((name) => normalized.includes(name));
  if (weekday) {
    return available.find(
      (date) =>
        normalizeText(
          new Intl.DateTimeFormat('es-ES', {
            timeZone: 'UTC',
            weekday: 'long',
          }).format(new Date(`${date}T12:00:00Z`)),
        ) === weekday,
    );
  }
  const dayOfMonth = normalized.match(/^(?:dia\s+)?(\d{1,2})$/)?.[1];
  if (dayOfMonth) {
    return available.find(
      (date) => Number(date.slice(8, 10)) === Number(dayOfMonth),
    );
  }
  return undefined;
};
const slotMenu = (slots: Slot[], page: number, date: string): string =>
  `Perfecto. Para el ${dateLabel(date)} tengo estos horarios. Elige un horario o dime la hora que prefieres:\n` +
  slots
    .slice(page * 8, page * 8 + 8)
    .map((s, i) => `${i + 1}. ${formatTime(s.scheduledAt)}`)
    .join('\n') +
  (slots.length > (page + 1) * 8
    ? '\nPuedes elegir «Más horarios» o escribir MÁS.'
    : '') +
  '\nSi prefieres otro día, elige «Otra fecha» o escribe FECHA.';
const slotChoices = (
  slots: Slot[],
  page: number,
  practitionerId: string,
): Menu => ({
  kind: 'slots',
  options: slots.slice(page * 8, page * 8 + 8).map((slot) => ({
    id: `S:${practitionerId}:${slot.scheduledAt}`,
    title: formatTime(slot.scheduledAt),
  })),
  hasMore: slots.length > (page + 1) * 8,
});

const dateChoices = (
  dates: string[],
  page: number,
  practitionerId: string,
): Menu => ({
  kind: 'dates',
  options: dates.slice(page * 8, page * 8 + 8).map((date) => ({
    id: `D:${practitionerId}:${date}`,
    title: new Intl.DateTimeFormat('es-ES', {
      timeZone: 'UTC',
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    }).format(new Date(`${date}T12:00:00Z`)),
  })),
  hasMore: dates.length > (page + 1) * 8,
  hasPrevious: page > 0,
});
const dateMenu = (dates: string[], page: number): string =>
  'Estos son los próximos días con disponibilidad. Elige el que mejor te venga:\n' +
  dates
    .slice(page * 8, page * 8 + 8)
    .map((date, i) => `${i + 1}. ${dateLabel(date)}`)
    .join('\n') +
  (dates.length > (page + 1) * 8
    ? '\nPuedes elegir «Más fechas» o escribir MÁS FECHAS.'
    : '') +
  (page > 0
    ? '\nPuedes elegir «Fechas anteriores» o escribir FECHAS ANTERIORES.'
    : '') +
  '\nTambién puedes decirme, por ejemplo, «mañana» o «viernes».';

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
        const stored = JSON.parse(
          receipts[0].reply.slice(storedMenuPrefix.length),
        ) as { reply: string; menu: Menu };
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
    const normalizedText = normalizeText(text);
    const settings = await this.booking.clinicSettings();
    const features = settings.features;
    const startsReschedule =
      /^(cambiar|mover|reprogramar) (mi |una )?cita$/.test(normalizedText);
    const reception = [
      features.receptionPhone
        ? 'Teléfono: ' + features.receptionPhone + '.'
        : '',
      features.receptionHours
        ? 'Horario: ' + features.receptionHours + '.'
        : '',
    ]
      .filter(Boolean)
      .join(' ');
    const startsCancellation = /^(cancelar|anular) (mi |una )?cita$/.test(
      normalizedText,
    );
    if (/^(recepcion|ayuda|hablar con recepcion)$/.test(normalizedText)) {
      reply = 'Contacta con recepción de la clínica.';
    } else if (/^(hola|menu|buenas)$/.test(normalizedText)) {
      state = undefined;
      const options = ['CITA para reservar'];
      if (await this.booking.cancellationsEnabled())
        options.push('CANCELAR CITA para cancelar');
      if (
        settings.platformEnabled &&
        settings.clinicEnabled &&
        features.reschedule
      )
        options.push('CAMBIAR CITA para cambiar la hora');
      options.push('RECEPCIÓN para pedir ayuda');
      menu = {
        kind: 'main',
        options: [
          { id: 'CITA', title: 'Reservar cita' },
          ...((await this.booking.cancellationsEnabled())
            ? [{ id: 'CANCELAR CITA', title: 'Cancelar cita' }]
            : []),
          ...(settings.platformEnabled &&
          settings.clinicEnabled &&
          features.reschedule
            ? [{ id: 'CAMBIAR CITA', title: 'Cambiar cita' }]
            : []),
          { id: 'RECEPCIÓN', title: 'Recepción' },
        ],
      };
      reply =
        (features.welcome.trim() ||
          '¡Hola! Soy el asistente de citas de la clínica.') +
        '\nEscribe ' +
        options.join(' · ') +
        '.';
    } else if (
      state?.step === 'another' &&
      /^(otra_misma|otra_persona|1|2|para mi|para otra persona)$/.test(
        normalizedText,
      )
    ) {
      const reuse = /^(otra_misma|1|para mi)$/.test(normalizedText);
      const identity = reuse
        ? {
            firstName: state.firstName,
            lastName: state.lastName,
            dateOfBirth: state.dateOfBirth,
            reuseIdentity: true,
          }
        : {};
      if (features.visitTypes.length) {
        state = {
          ...identity,
          step: 'visitType',
          visitTypes: features.visitTypes,
        };
        reply =
          'Elige el tipo de cita:\n' +
          features.visitTypes
            .map((type, i) => i + 1 + '. ' + type.name)
            .join('\n') +
          '\nEscribe el número de la opción.';
      } else {
        const professionals = await this.booking.practitioners();
        state = { ...identity, step: 'professional', professionals };
        reply = professionals.length
          ? 'Elige el profesional con quien quieres reservar:\n' +
            professionals
              .map((p, i) => `${i + 1}. ${p.firstName} ${p.lastName}`)
              .join('\n')
          : 'Ahora mismo no hay profesionales disponibles. Contacta con recepción.';
        if (professionals.length)
          menu = {
            kind: 'professionals',
            options: professionals.map((p) => ({
              id: `P:${p.id}`,
              title: `${p.firstName} ${p.lastName}`,
            })),
          };
      }
    } else if (
      state?.step === 'another' &&
      !isStartCommand(text) &&
      !startsCancellation &&
      !startsReschedule &&
      !isCancelCommand(text)
    ) {
      reply =
        '¿Quieres reservar otra cita para la misma persona o para otra? Elige 1 para la misma persona o 2 para otra persona.';
      menu = {
        kind: 'another',
        options: [
          { id: 'OTRA_MISMA', title: 'Para mí' },
          { id: 'OTRA_PERSONA', title: 'Para otra persona' },
        ],
      };
    } else if (
      startsReschedule &&
      !(
        settings.platformEnabled &&
        settings.clinicEnabled &&
        features.reschedule
      )
    ) {
      reply = 'Contacta con recepción para cambiar tu cita.';
    } else if (
      (startsCancellation ||
        (!state?.rescheduling && state?.step.startsWith('cancel'))) &&
      !isCancelCommand(text) &&
      !(await this.booking.cancellationsEnabled())
    ) {
      if (state?.step.startsWith('cancel')) state = undefined;
      reply =
        'Esta clínica gestiona las cancelaciones a través de recepción. Contacta con la clínica si necesitas cancelar una cita.';
    } else if (startsCancellation || startsReschedule) {
      state = { step: 'cancelDob', rescheduling: startsReschedule };
      reply =
        'Para buscar tus reservas, indica tu fecha de nacimiento (por ejemplo, 21/04/1990).';
    } else if (
      isCancelCommand(text) ||
      (state?.step === 'confirm' && normalizedText === 'no')
    ) {
      const cancellingExisting =
        state?.rescheduling || state?.step.startsWith('cancel');
      state = undefined;
      reply = cancellingExisting
        ? 'De acuerdo, no he cancelado ninguna cita ni cambiado su horario. Escribe CITA cuando quieras reservar.'
        : 'Sin problema, he cancelado el proceso de reserva. Cuando quieras, escribe CITA y empezamos de nuevo.';
    } else if (state?.step === 'cancelDob' || state?.step === 'cancelName') {
      const askingName = state.step === 'cancelName';
      const parsed = askingName ? state.dateOfBirth! : birthDate(text);
      if (
        !parsed ||
        !isDateString(parsed, { strict: true }) ||
        parsed > localDate(new Date())
      ) {
        reply =
          'Indica una fecha de nacimiento válida, por ejemplo 21/04/1990.';
      } else {
        const cancellationName = askingName ? text : undefined;
        const appointments = await this.booking.cancellableAppointments(
          message.phone,
          parsed,
          cancellationName,
          state.rescheduling,
        );
        if (appointments === null) {
          state = { ...state, step: 'cancelName', dateOfBirth: parsed };
          reply =
            'Hay varias fichas con esa fecha. Escribe el nombre y los apellidos de la persona de la cita.';
        } else if (!appointments.length) {
          reply = state.rescheduling
            ? 'No encuentro citas disponibles para cambiar con esos datos. Contacta con recepción.'
            : 'No encuentro citas que puedas cancelar por WhatsApp con estos datos. Si estás fuera de plazo o necesitas ayuda, contacta con recepción.';
          state = undefined;
        } else {
          const options = appointments.map((a) => ({
            id: a.id,
            scheduledAt: a.scheduledAt.toISOString(),
            practitionerName: a.practitionerName,
            visitTypeId: a.visitTypeId ?? undefined,
          }));
          state = {
            ...state,
            step: 'cancelPick',
            dateOfBirth: parsed,
            cancellationName,
            appointments: options,
          };
          reply =
            'Estas son tus citas. Escribe el número de la que quieres ' +
            (state.rescheduling ? 'cambiar' : 'cancelar') +
            ':\n' +
            options
              .map(
                (a, i) =>
                  `${i + 1}. ${a.practitionerName}: ${formatSlot(a.scheduledAt)}`,
              )
              .join('\n') +
            '\nEscribe SALIR para volver.';
        }
      }
    } else if (state?.step === 'cancelPick') {
      const appointments = state.appointments ?? [];
      const index = menuChoice(text, appointments.length);
      if (index < 0)
        reply = 'Indica el número de la cita que has elegido, o escribe SALIR.';
      else if (state.rescheduling) {
        const selected = appointments[index];
        const professionals = await this.booking.practitioners(
          selected.visitTypeId,
        );
        state = {
          ...state,
          step: 'professional',
          professionals,
          visitTypeId: selected.visitTypeId,
          original: selected,
          appointments: undefined,
        };
        reply = professionals.length
          ? 'Elige el profesional para el nuevo horario:\n' +
            professionals
              .map((p, i) => i + 1 + '. ' + p.firstName + ' ' + p.lastName)
              .join('\n')
          : 'No quedan profesionales disponibles. Contacta con recepción para cambiar tu cita.';
      } else {
        const selected = appointments[index];
        state = {
          ...state,
          step: 'cancelConfirm',
          cancellationId: selected.id,
          scheduledAt: selected.scheduledAt,
        };
        reply = `¿Confirmas que quieres cancelar tu cita con ${selected.practitionerName} el ${formatSlot(selected.scheduledAt)}? Responde SI para cancelarla o SALIR para conservarla.`;
      }
    } else if (state?.step === 'cancelConfirm') {
      if (!/^(si|confirmo|confirmar)$/.test(normalizedText))
        reply = 'Responde SI para cancelar la cita o SALIR para conservarla.';
      else {
        const cancelled = await this.booking.cancelAppointment(
          message.phone,
          state.dateOfBirth!,
          state.cancellationId!,
          state.scheduledAt!,
          state.cancellationName,
        );
        state = undefined;
        reply = cancelled
          ? 'Tu cita ha quedado cancelada.'
          : 'No he podido cancelar esa cita porque ya no está disponible con esos datos. Contacta con recepción.';
      }
    } else if (
      (!state || isStartCommand(text)) &&
      settings.platformEnabled &&
      settings.clinicEnabled &&
      features.visitTypes.length
    ) {
      state = { step: 'visitType', visitTypes: features.visitTypes };
      reply =
        (features.welcome.trim() || 'Elige el tipo de cita.') +
        '\n' +
        features.visitTypes
          .map((type, i) => i + 1 + '. ' + type.name)
          .join('\n') +
        '\nEscribe el número de la opción.';
    } else if (!state || isStartCommand(text) || state.step === 'visitType') {
      const type =
        state?.step === 'visitType'
          ? state.visitTypes?.[menuChoice(text, state.visitTypes.length)]
          : undefined;
      const professionals =
        state?.step === 'visitType' && !type
          ? []
          : await this.booking.practitioners(type?.id);
      if (!professionals.length) {
        reply =
          state?.step === 'visitType' && !type
            ? 'Escribe el número de un tipo de cita de la lista.'
            : 'Ahora mismo no hay profesionales disponibles para reservar automáticamente. Si quieres, contacta con recepción.';
      } else {
        state = {
          ...(state?.step === 'visitType' ? state : {}),
          step: 'professional',
          professionals,
          visitTypeId: type?.id,
        };
        reply =
          (type
            ? ''
            : features.welcome.trim()
              ? features.welcome.trim() + '\n'
              : '¡Claro! Te ayudo a buscar una cita. ') +
          'Elige el profesional con quien quieres reservar:\n' +
          professionals
            .map((p, i) => `${i + 1}. ${p.firstName} ${p.lastName}`)
            .join('\n') +
          '\nTambién puedes decirme su nombre. Escribe CANCELAR si quieres salir.';
        menu = {
          kind: 'professionals',
          options: professionals.map((p) => ({
            id: `P:${p.id}`,
            title: `${p.firstName} ${p.lastName}`,
          })),
        };
      }
    } else if (state.step === 'professional') {
      const professionals = state.professionals ?? [];
      const normalizedName = normalizedText.replace(
        /^(dr\.?|dra\.?|doctor|doctora)\s+/,
        '',
      );
      const matchingProfessionals = professionals
        .map((person, index) => ({ person, index }))
        .filter(({ person }) => {
          const name = normalizeText(`${person.firstName} ${person.lastName}`);
          return name === normalizedName || name.includes(normalizedName);
        });
      const index = text.startsWith('P:')
        ? professionals.findIndex((p) => text === `P:${p.id}`)
        : menuChoice(text, professionals.length) >= 0
          ? menuChoice(text, professionals.length)
          : matchingProfessionals.length === 1
            ? matchingProfessionals[0].index
            : -1;
      if (index < 0)
        reply =
          'No he podido identificarlo. Elige uno de los profesionales de la lista o escribe su nombre completo.';
      else {
        const person = state.professionals![index];
        const dates = await this.booking.availableDates(
          person.id,
          state.visitTypeId,
          state.original?.id,
        );
        state = {
          ...state,
          step: 'date',
          practitionerId: person.id,
          practitionerName: `${person.firstName} ${person.lastName}`,
          dateOptions: dates,
          datePage: 0,
        };
        reply = dates.length
          ? `Perfecto, ${person.firstName}. ${dateMenu(dates, 0)}`
          : 'No veo fechas disponibles para ese profesional. Puedes probar con otra persona escribiendo CITA.';
        if (dates.length) menu = dateChoices(dates, 0, person.id);
      }
    } else if (state.step === 'date') {
      const dates = state.dateOptions ?? [];
      const page = state.datePage ?? 0;
      const pageDates = dates.slice(page * 8, page * 8 + 8);
      const selected = text.startsWith('D:')
        ? pageDates.find(
            (date) => text === `D:${state!.practitionerId}:${date}`,
          )
        : pageDates[menuChoice(text, pageDates.length)];
      const chosenDate =
        selected ??
        (!text.startsWith('D:') ? naturalDate(text, dates) : undefined);
      if (/^fechas?\s*anteriores$/i.test(normalizedText) && page > 0) {
        state = { ...state, datePage: page - 1 };
        reply = dateMenu(dates, page - 1);
        menu = dateChoices(dates, page - 1, state.practitionerId!);
      } else if (
        /^mas\s*(fechas|dias)?$/i.test(normalizedText) &&
        dates.length > (page + 1) * 8
      ) {
        state = { ...state, datePage: page + 1 };
        reply = dateMenu(dates, page + 1);
        menu = dateChoices(dates, page + 1, state.practitionerId!);
      } else if (!chosenDate || !isDateString(chosenDate, { strict: true })) {
        reply =
          'Elige una de las fechas de la lista o dime una fecha, por ejemplo «mañana», «viernes» o «21/11». ' +
          dateMenu(dates, page);
        if (pageDates.length)
          menu = dateChoices(dates, page, state.practitionerId!);
      } else {
        try {
          const slots = await this.booking.slots(
            {
              practitionerId: state.practitionerId!,
              date: chosenDate,
              visitTypeId: state.visitTypeId,
            },
            state.original?.id,
          );
          if (!slots.length) {
            const refreshed = await this.booking.availableDates(
              state.practitionerId!,
              state.visitTypeId,
              state.original?.id,
            );
            state = { ...state, dateOptions: refreshed, datePage: 0 };
            reply = refreshed.length
              ? `Lo siento, el ${dateLabel(chosenDate)} acaba de quedarse sin huecos. ${dateMenu(refreshed, 0)}`
              : 'Lo siento, ya no quedan fechas disponibles. Si quieres, contacta con recepción.';
            if (refreshed.length)
              menu = dateChoices(refreshed, 0, state.practitionerId!);
          } else {
            state = {
              ...state,
              step: 'slot',
              date: chosenDate,
              slots,
              slotPage: 0,
            };
            reply = slotMenu(slots, 0, chosenDate);
            menu = slotChoices(slots, 0, state.practitionerId!);
          }
        } catch (err) {
          if (!(err instanceof HttpException) || err.getStatus() >= 500)
            throw err;
          reply = `No puedo consultar el ${dateLabel(chosenDate)}. Elige otra fecha de la lista o escribe una diferente.`;
          if (pageDates.length)
            menu = dateChoices(dates, page, state.practitionerId!);
        }
      }
    } else if (state.step === 'slot') {
      const slots = state.slots ?? [];
      const page = state.slotPage ?? 0;
      const practitionerId = state.practitionerId;
      const pageSlots = slots.slice(page * 8, page * 8 + 8);
      const index = text.startsWith('S:')
        ? pageSlots.findIndex(
            (slot) => text === `S:${practitionerId}:${slot.scheduledAt}`,
          )
        : menuChoice(text, pageSlots.length) >= 0
          ? menuChoice(text, pageSlots.length)
          : (() => {
              const match = normalizedText.match(
                /^(?:(?:a|sobre)\s+)?(?:las?\s+)?([01]?\d|2[0-3])(?::([0-5]\d)|h([0-5]\d)?)?$/,
              );
              if (!match) return -1;
              const wanted = `${match[1].padStart(2, '0')}:${(match[2] ?? match[3] ?? '00').padStart(2, '0')}`;
              const matches = pageSlots
                .map((slot, index) => ({ slot, index }))
                .filter(({ slot }) => formatTime(slot.scheduledAt) === wanted);
              return matches.length === 1 ? matches[0].index : -1;
            })();
      if (/^fecha$/i.test(text)) {
        const dates = await this.booking.availableDates(
          state.practitionerId!,
          state.visitTypeId,
          state.original?.id,
        );
        state = {
          ...state,
          step: 'date',
          practitionerId: state.practitionerId,
          practitionerName: state.practitionerName,
          dateOptions: dates,
          datePage: 0,
        };
        reply = dates.length
          ? `Claro. Estos son los días disponibles para ${state.practitionerName}:\n${dateMenu(dates, 0)}`
          : 'No veo fechas disponibles para ese profesional. Puedes probar con otra persona escribiendo CITA.';
        if (dates.length) menu = dateChoices(dates, 0, state.practitionerId!);
      } else if (/^m[aá]s$/i.test(text) && slots.length > (page + 1) * 8) {
        state = { ...state, slotPage: page + 1 };
        reply = slotMenu(slots, page + 1, state.date!);
        menu = slotChoices(slots, page + 1, state.practitionerId!);
      } else if (index < 0) {
        reply =
          'No he encontrado esa hora. Elige uno de los horarios de la lista, escribe una hora como «10:30» o pide otra fecha con FECHA.';
        if (pageSlots.length)
          menu = slotChoices(slots, page, state.practitionerId!);
      } else {
        state = {
          ...state,
          step: state.rescheduling
            ? 'confirm'
            : state.reuseIdentity
              ? settings.askReason
                ? 'reason'
                : features.reminderHours > 0
                  ? 'reminder'
                  : 'confirm'
              : 'firstName',
          scheduledAt: slots[page * 8 + index].scheduledAt,
          slots: undefined,
          slotPage: undefined,
        };
        reply = state.rescheduling
          ? '¿Confirmas el cambio al ' +
            formatSlot(state.scheduledAt!) +
            ' con ' +
            state.practitionerName +
            '? Responde SI para cambiarla o SALIR para conservar tu cita.'
          : state.reuseIdentity
            ? state.step === 'reason'
              ? '¿Quieres indicar brevemente el motivo de tu visita? Escríbelo en una frase o responde OMITIR.'
              : state.step === 'reminder'
                ? reminderPrompt
                : `Perfecto. ¿Te viene bien la cita con ${state.practitionerName} el ${formatSlot(state.scheduledAt!)}? Responde SI para reservar o CANCELAR para salir.`
            : '¿A nombre de quién reservo? Escríbeme tu nombre y apellidos juntos.';
        if (state.step === 'confirm' && !state.rescheduling)
          menu = {
            kind: 'confirm',
            options: [
              {
                id: `CONFIRMAR:${state.practitionerId}:${state.scheduledAt}`,
                title: 'Confirmar cita',
              },
              { id: 'CANCELAR', title: 'Cancelar' },
            ],
          };
      }
    } else if (state.step === 'firstName' || state.step === 'lastName') {
      if (state.step === 'firstName') {
        const parts = text.trim().split(/\s+/);
        const firstName = parts.shift() ?? '';
        const lastName = parts.join(' ');
        if (
          !firstName ||
          !lastName ||
          firstName.length > 100 ||
          lastName.length > 100
        ) {
          reply =
            'Escríbeme tu nombre y apellidos juntos, por ejemplo: Ana García López.';
        } else {
          state = { ...state, firstName, lastName, step: 'dob' };
          reply =
            'Para asociar la cita a la ficha correcta, dime tu fecha de nacimiento (por ejemplo, 21/04/1990).';
        }
      } else if (!text || text.length > 100) {
        reply =
          'No he entendido ese dato. Envíame tus apellidos de hasta 100 caracteres.';
      } else {
        state = { ...state, lastName: text, step: 'dob' };
        reply =
          'Para asociar la cita a la ficha correcta, dime tu fecha de nacimiento (por ejemplo, 21/04/1990).';
      }
    } else if (state.step === 'dob') {
      const parsedBirthDate = birthDate(text);
      if (
        !parsedBirthDate ||
        !isDateString(parsedBirthDate, { strict: true }) ||
        parsedBirthDate > localDate(new Date())
      ) {
        reply =
          'No he podido leer la fecha. Envíamela como día/mes/año, por ejemplo 21/04/1990.';
      } else {
        if ((await this.booking.clinicSettings()).askReason) {
          state = { ...state, dateOfBirth: parsedBirthDate, step: 'reason' };
          reply =
            '¿Quieres indicar brevemente el motivo de tu visita? Escríbelo en una frase o responde OMITIR.';
        } else if (features.reminderHours > 0) {
          state = { ...state, dateOfBirth: parsedBirthDate, step: 'reminder' };
          reply = reminderPrompt;
        } else {
          state = { ...state, dateOfBirth: parsedBirthDate, step: 'confirm' };
          reply = `Perfecto. ¿Te viene bien la cita con ${state.practitionerName} el ${formatSlot(state.scheduledAt!)}? Responde SI para reservar o CANCELAR para salir.`;
          menu = {
            kind: 'confirm',
            options: [
              {
                id: `CONFIRMAR:${state.practitionerId}:${state.scheduledAt}`,
                title: 'Confirmar cita',
              },
              { id: 'CANCELAR', title: 'Cancelar' },
            ],
          };
        }
      }
    } else if (state.step === 'reason' || state.step === 'reminder') {
      if (state.step === 'reminder' && !/^(si|no)$/.test(normalizedText)) {
        reply = `No he entendido tu respuesta. ${reminderPrompt}`;
      } else if (state.step === 'reason' && text.length > 300) {
        reply =
          'Por favor, resume el motivo en un máximo de 300 caracteres o escribe OMITIR.';
      } else if (state.step === 'reason' && features.reminderHours > 0) {
        state = {
          ...state,
          reason: normalizedText === 'omitir' ? undefined : text,
          step: 'reminder',
        };
        reply = reminderPrompt;
      } else {
        state = {
          ...state,
          reason:
            state.step === 'reason'
              ? normalizedText === 'omitir'
                ? undefined
                : text
              : state.reason,
          reminderOptIn: state.step === 'reminder' && normalizedText === 'si',
          step: 'confirm',
        };
        reply = `Perfecto. ¿Te viene bien la cita con ${state.practitionerName} el ${formatSlot(state.scheduledAt!)}? Responde SI para reservar o CANCELAR para salir.`;
        menu = {
          kind: 'confirm',
          options: [
            {
              id: `CONFIRMAR:${state.practitionerId}:${state.scheduledAt}`,
              title: 'Confirmar cita',
            },
            { id: 'CANCELAR', title: 'Cancelar' },
          ],
        };
      }
    } else {
      const confirms =
        /^(si|confirmo|confirmar|vale|de acuerdo|ok|adelante|perfecto)$/i.test(
          normalizedText,
        );
      if (
        !confirms &&
        text !== `CONFIRMAR:${state.practitionerId}:${state.scheduledAt}`
      ) {
        reply = state.rescheduling
          ? 'Responde SI para cambiar la cita o SALIR para conservarla.'
          : `¿Te viene bien la cita con ${state.practitionerName} el ${formatSlot(state.scheduledAt!)}? Responde SI para reservar o CANCELAR para salir.`;
        menu = {
          kind: 'confirm',
          options: [
            {
              id: `CONFIRMAR:${state.practitionerId}:${state.scheduledAt}`,
              title: 'Confirmar cita',
            },
            { id: 'CANCELAR', title: 'Cancelar' },
          ],
        };
      } else {
        // An overlap is a database error; roll back to a savepoint before
        // recording the human-readable response in the surrounding transaction.
        const cancellationHint = (await this.booking.cancellationsEnabled())
          ? ' Si necesitas cancelarla, escribe CANCELAR CITA.'
          : ' Si necesitas cancelarla, contacta con recepción.';
        await manager.query('SAVEPOINT whatsapp_booking_attempt');
        try {
          if (state.original) {
            await this.booking.rescheduleAppointment({
              phone: message.phone,
              dateOfBirth: state.dateOfBirth!,
              fullName: state.cancellationName,
              id: state.original.id,
              expectedAt: state.original.scheduledAt,
              practitionerId: state.practitionerId!,
              scheduledAt: state.scheduledAt!,
            });
            reply =
              'Tu cita se ha cambiado al ' +
              formatSlot(state.scheduledAt!) +
              ' con ' +
              state.practitionerName +
              '.';
          } else {
            const result = await this.booking.book(
              {
                practitionerId: state.practitionerId!,
                scheduledAt: state.scheduledAt!,
                firstName: state.firstName!,
                lastName: state.lastName!,
                dateOfBirth: state.dateOfBirth!,
                reason: state.reason,
                visitTypeId: state.visitTypeId,
                reminderOptIn: state.reminderOptIn,
                phone: message.phone,
              },
              `wa:${messageHash}`,
            );
            reply =
              result.status === 'scheduled'
                ? `¡Listo! Tu cita con ${state.practitionerName} está reservada para el ${formatSlot(result.scheduledAt.toISOString())}.${cancellationHint}`
                : 'Lo siento, la cita no se ha podido dejar programada. Contacta con recepción y te ayudarán.';
          }
          await manager.query('RELEASE SAVEPOINT whatsapp_booking_attempt');
          if (!state.original && reply.startsWith('¡Listo!')) {
            state = {
              step: 'another',
              firstName: state.firstName,
              lastName: state.lastName,
              dateOfBirth: state.dateOfBirth,
            };
            reply +=
              '\n¿Quieres reservar otra cita? Elige 1 para la misma persona o 2 para otra persona.';
            menu = {
              kind: 'another',
              options: [
                { id: 'OTRA_MISMA', title: 'Para mí' },
                { id: 'OTRA_PERSONA', title: 'Para otra persona' },
              ],
            };
          } else state = undefined;
        } catch (err) {
          await manager.query('ROLLBACK TO SAVEPOINT whatsapp_booking_attempt');
          await manager.query('RELEASE SAVEPOINT whatsapp_booking_attempt');
          if (!(err instanceof HttpException) || err.getStatus() >= 500)
            throw err;
          reply = state?.rescheduling
            ? 'No he podido cambiar la cita. Si sigue programada, conserva su horario anterior. Contacta con recepción si necesitas ayuda.'
            : 'Lo siento, no he podido confirmar la cita. Puede que el horario se haya ocupado o que recepción tenga que revisar los datos. No se ha creado una nueva reserva; escribe CITA y buscamos otra opción.';
          state = undefined;
        }
      }
    }
    if (reception && /recepción/i.test(reply) && settings.platformEnabled)
      reply += '\n' + reception;
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
      [
        tenantId,
        messageHash,
        phoneHash,
        contentHash,
        menu ? storedMenuPrefix + JSON.stringify({ reply, menu }) : reply,
      ],
    );
    return { reply, ...(menu ? { menu } : {}), duplicate: false };
  }
}
