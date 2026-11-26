import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { from } from 'rxjs';
import { DataSource } from 'typeorm';
import { TenancyContext } from '../tenancy/tenancy-context';
import { runInTenantTransaction } from '../tenancy/run-in-tenant-transaction';
import { WhatsappBookingService } from './whatsapp-booking.service';
import {
  flowIdempotencyKey,
  verifyFlowToken,
  type FlowTokenPayload,
} from './whatsapp-flow-crypto';
import { resolvePatientPhone } from './whatsapp-demo-bindings';

export class FlowTokenError extends Error {}

type FlowRequest = {
  action?: unknown;
  screen?: unknown;
  flow_token?: unknown;
  data?: unknown;
};
type Choice = { id: string; title: string };

const TIME_ZONE = 'Europe/Madrid';
const MAX_SLOTS = 20; // RadioButtonsGroup accepts at most 20 options.
const CALENDAR_DAYS = 31;

const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const datesFrom = (start: string, count: number) =>
  Array.from({ length: count }, (_, index) => {
    const date = new Date(`${start}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
const timeOf = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
const dayAndTime = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
const cleanName = (value: unknown) =>
  typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : '';
const validName = (value: string) =>
  value.length >= 3 && value.length <= 150 && value.split(' ').length >= 2;
const validBirthDate = (value: unknown) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value &&
  value >= '1900-01-01' &&
  value <= today();

/**
 * Stateless implementation of the encrypted Flow endpoint. Nothing the client
 * sends is trusted: every step re-reads availability from Mederi, and the
 * booking itself re-checks the slot, the patient and idempotency.
 */
@Injectable()
export class WhatsappFlowService {
  constructor(
    private readonly database: DataSource,
    private readonly tenancy: TenancyContext,
    private readonly config: ConfigService,
    private readonly booking: WhatsappBookingService,
  ) {}

  private async inTenant<T>(
    tenantId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return (await runInTenantTransaction(
      this.database,
      this.tenancy,
      tenantId,
      { handle: () => from(operation()) },
      { whatsappTenantConnection: true },
    )) as T;
  }

  private async session(token: unknown): Promise<FlowTokenPayload> {
    const key = this.config.get<string>('WHATSAPP_CREDENTIAL_KEY') ?? '';
    const payload = verifyFlowToken(key, token);
    if (!payload) throw new FlowTokenError();
    const [route] = await this.database.query<{ tenant_id: string | null }[]>(
      'SELECT iam.whatsapp_connection_tenant($1) AS tenant_id',
      [payload.phoneNumberId],
    );
    if (route?.tenant_id !== payload.tenantId) throw new FlowTokenError();
    return payload;
  }

  private async professionals(tenantId: string): Promise<Choice[]> {
    const rows = await this.inTenant(tenantId, () =>
      this.booking.practitioners(),
    );
    return rows.slice(0, 20).map((p) => ({
      id: p.id,
      title: `${p.firstName} ${p.lastName}`.trim().slice(0, 30),
    }));
  }

  private async calendar(tenantId: string, practitionerId: string) {
    const available = new Set(
      await this.inTenant(tenantId, () =>
        this.booking.availableDates(practitionerId),
      ),
    );
    const all = datesFrom(today(), CALENDAR_DAYS);
    return {
      allowed: all.filter((day) => available.has(day)),
      min_fecha: all[0],
      max_fecha: all[all.length - 1],
      no_disponibles: all.filter((day) => !available.has(day)),
    };
  }

  private dateScreen(
    cal: Awaited<ReturnType<WhatsappFlowService['calendar']>>,
    error?: string,
  ) {
    return {
      screen: 'FECHA',
      data: {
        min_fecha: cal.min_fecha,
        max_fecha: cal.max_fecha,
        no_disponibles: cal.no_disponibles,
        ...(error ? { error_message: error } : {}),
      },
    };
  }

  private async times(
    tenantId: string,
    practitionerId: string,
    date: string,
  ): Promise<Choice[]> {
    const slots = await this.inTenant(tenantId, () =>
      this.booking.slots({ practitionerId, date }),
    );
    return slots.slice(0, MAX_SLOTS).map((slot) => ({
      id: slot.scheduledAt,
      title: timeOf(slot.scheduledAt),
    }));
  }

  async handle(request: FlowRequest): Promise<unknown> {
    if (request.action === 'ping') return { data: { status: 'active' } };
    const data = (
      request.data && typeof request.data === 'object' ? request.data : {}
    ) as Record<string, unknown>;
    if (data.error) return { data: { acknowledged: true } };
    const session = await this.session(request.flow_token);
    const tenantId = session.tenantId;

    if (request.action === 'INIT') {
      const list = await this.professionals(tenantId);
      if (!list.length)
        return {
          screen: 'PROFESIONAL',
          data: {
            profesionales: [
              { id: 'none', title: 'Sin profesionales disponibles' },
            ],
            error_message:
              'Ahora mismo no hay agenda disponible. Contacta con recepción.',
          },
        };
      return { screen: 'PROFESIONAL', data: { profesionales: list } };
    }
    if (request.action !== 'data_exchange')
      throw new Error('Acción de Flow no admitida');

    const practitionerId =
      typeof data.profesional === 'string' && isUUID(data.profesional)
        ? data.profesional
        : '';
    const list =
      request.screen === 'PROFESIONAL' || practitionerId
        ? await this.professionals(tenantId)
        : [];
    const practitioner = list.find((item) => item.id === practitionerId);
    if (!practitioner)
      return {
        screen: 'PROFESIONAL',
        data: {
          profesionales: list,
          error_message: 'Elige un profesional de la lista.',
        },
      };

    if (request.screen === 'PROFESIONAL') {
      const cal = await this.calendar(tenantId, practitioner.id);
      if (!cal.allowed.length)
        return {
          screen: 'PROFESIONAL',
          data: {
            profesionales: list,
            error_message: 'No hay fechas disponibles. Contacta con recepción.',
          },
        };
      return this.dateScreen(cal);
    }

    const date = typeof data.fecha === 'string' ? data.fecha : '';
    const cal = await this.calendar(tenantId, practitioner.id);
    if (!cal.allowed.includes(date))
      return this.dateScreen(cal, 'Elige una fecha disponible.');

    if (request.screen === 'FECHA') {
      const horarios = await this.times(tenantId, practitioner.id, date);
      if (!horarios.length)
        return this.dateScreen(cal, 'Ese día ya no tiene huecos. Elige otro.');
      return { screen: 'HORA', data: { horarios } };
    }

    const slot = typeof data.hora === 'string' ? data.hora : '';
    const horarios = await this.times(tenantId, practitioner.id, date);
    if (!horarios.some((item) => item.id === slot)) {
      if (!horarios.length)
        return this.dateScreen(cal, 'Ese día ya no tiene huecos. Elige otro.');
      return {
        screen: 'HORA',
        data: {
          horarios,
          error_message: 'Ese horario ya no está disponible. Elige otro.',
        },
      };
    }

    if (request.screen === 'HORA') return { screen: 'DATOS', data: {} };

    const fullName = cleanName(data.nombre);
    if (!validName(fullName) || !validBirthDate(data.nacimiento)) {
      return {
        screen: 'DATOS',
        data: {
          error_message:
            'Escribe nombre y apellidos y selecciona una fecha de nacimiento válida.',
        },
      };
    }
    const summary = `${practitioner.title}\n${dayAndTime(slot)}\n${fullName}`;
    if (request.screen === 'DATOS')
      return { screen: 'RESUMEN', data: { resumen: summary } };
    if (request.screen !== 'RESUMEN')
      throw new Error('Pantalla de Flow no admitida');

    // One first name plus the remaining words as surnames; ambiguous matches
    // with an existing patient are routed to reception by the booking service.
    const [firstName, ...rest] = fullName.split(' ');
    const patientPhone = resolvePatientPhone(
      this.config,
      session.phone,
    ).patientPhone;
    try {
      const result = await this.inTenant(tenantId, () =>
        this.booking.book(
          {
            practitionerId: practitioner.id,
            scheduledAt: slot,
            firstName,
            lastName: rest.join(' '),
            dateOfBirth: data.nacimiento as string,
            phone: patientPhone,
          },
          flowIdempotencyKey(request.flow_token as string),
        ),
      );
      if (result.status !== 'scheduled') throw new Error('Cita no programada');
      return {
        screen: 'SUCCESS',
        data: {
          extension_message_response: {
            params: { flow_token: request.flow_token, referencia: result.id },
          },
        },
      };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) {
        return {
          screen: 'RESUMEN',
          data: {
            resumen: summary,
            error_message:
              'No se ha podido reservar. El horario puede haberse ocupado o recepción debe revisar tus datos.',
          },
        };
      }
      throw error;
    }
  }
}
