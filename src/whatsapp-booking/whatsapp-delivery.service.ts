import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { TenancyContext } from '../tenancy/tenancy-context';
import { DeliveryClaimDto, DeliveryResultDto } from './whatsapp-booking.dto';

const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class WhatsappDeliveryService {
  constructor(private readonly context: TenancyContext) {}

  async pendingReview() {
    return this.context.manager.query<
      {
        messageHash: string;
        status: string;
        claimedAt: Date | null;
        createdAt: Date;
      }[]
    >(
      `SELECT message_hash AS "messageHash", delivery_status AS status,
              delivery_claimed_at AS "claimedAt", created_at AS "createdAt"
       FROM public.whatsapp_booking_receipts
       WHERE tenant_id = $1 AND
         (delivery_status = 'uncertain' OR
          (delivery_status = 'claimed' AND delivery_claimed_at < now() - interval '2 minutes') OR
          (delivery_status = 'pending' AND created_at < now() - interval '2 minutes'))
       ORDER BY COALESCE(delivery_claimed_at, created_at) ASC LIMIT 100`,
      [this.context.tenantId],
    );
  }

  // Flow messages are created by the encrypted Flow endpoint rather than
  // the chat conversation state machine. Register their delivery receipt
  // before claiming so retries remain idempotent without changing a session.
  async prepareFlow(body: DeliveryClaimDto) {
    const tenantId = this.context.tenantId;
    const messageHash = hash(body.messageId);
    const phoneHash = hash(body.phone);
    const contentHash = hash(`flow-notification\n${body.phone}`);
    await this.context.manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`wa-message:${tenantId}:${messageHash}`],
    );
    const rows = await this.context.manager.query<
      { phone_hash: string; content_hash: string }[]
    >(
      'SELECT phone_hash, content_hash FROM public.whatsapp_booking_receipts WHERE message_hash = $1',
      [messageHash],
    );
    if (rows.length) {
      if (rows[0].phone_hash !== phoneHash || rows[0].content_hash !== contentHash)
        throw new ConflictException('Identificador de mensaje ya utilizado');
      return { prepared: true, duplicate: true };
    }
    await this.context.manager.query(
      `INSERT INTO public.whatsapp_booking_receipts
       (tenant_id, message_hash, phone_hash, content_hash, reply)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, messageHash, phoneHash, contentHash, 'FLOW_NOTIFICATION'],
    );
    return { prepared: true, duplicate: false };
  }

  private async receipt(body: DeliveryClaimDto) {
    const rows = await this.context.manager.query<
      {
        delivery_status: 'pending' | 'claimed' | 'sent' | 'uncertain';
        delivery_attempt: string | null;
      }[]
    >(
      `SELECT delivery_status, delivery_attempt FROM public.whatsapp_booking_receipts
       WHERE tenant_id = $1 AND message_hash = $2 AND phone_hash = $3 FOR UPDATE`,
      [this.context.tenantId, hash(body.messageId), hash(body.phone)],
    );
    if (!rows.length) throw new NotFoundException('Mensaje no encontrado');
    return rows[0];
  }

  async claim(body: DeliveryClaimDto) {
    const row = await this.receipt(body);
    if (row.delivery_status !== 'pending')
      return { send: false, status: row.delivery_status };
    const attempt = randomUUID();
    await this.context.manager.query(
      `UPDATE public.whatsapp_booking_receipts SET delivery_status = 'claimed',
       delivery_attempt = $4, delivery_claimed_at = now()
       WHERE tenant_id = $1 AND message_hash = $2 AND phone_hash = $3`,
      [this.context.tenantId, hash(body.messageId), hash(body.phone), attempt],
    );
    return { send: true, status: 'claimed', attempt };
  }

  async result(body: DeliveryResultDto) {
    const row = await this.receipt(body);
    if (row.delivery_attempt !== body.attempt)
      throw new ConflictException('Intento de entrega no válido');
    if (row.delivery_status === body.result)
      return { status: row.delivery_status };
    if (row.delivery_status !== 'claimed')
      throw new ConflictException('La entrega ya tiene un resultado');
    await this.context.manager.query(
      `UPDATE public.whatsapp_booking_receipts SET delivery_status = $4
       WHERE tenant_id = $1 AND message_hash = $2 AND phone_hash = $3`,
      [
        this.context.tenantId,
        hash(body.messageId),
        hash(body.phone),
        body.result,
      ],
    );
    return { status: body.result };
  }
}
