import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { from } from 'rxjs';
import { DataSource } from 'typeorm';
import { TenancyContext } from '../tenancy/tenancy-context';
import { runInTenantTransaction } from '../tenancy/run-in-tenant-transaction';
import { WhatsappConversationService } from './whatsapp-conversation.service';
import { WhatsappDeliveryService } from './whatsapp-delivery.service';
import { WhatsappCredentialCrypto } from './whatsapp-credential-crypto';
import { whatsappMetaPayload } from './whatsapp-meta-payload';
import { resolvePatientPhone } from './whatsapp-demo-bindings';
import { signFlowToken } from './whatsapp-flow-crypto';

@Injectable()
export class WhatsappTenantRouterService {
  constructor(
    private readonly database: DataSource,
    private readonly tenancy: TenancyContext,
    private readonly config: ConfigService,
    private readonly conversation: WhatsappConversationService,
    private readonly deliveries: WhatsappDeliveryService,
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

  private flowPayload(to: string, flowId: string, flowToken: string) {
    const draft = this.config.get<string>('WHATSAPP_FLOW_MODE') === 'draft';
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'flow',
        body: {
          text: 'Reserva tu cita en unos pasos: elige profesional, día y hora.',
        },
        footer: { text: 'Tus datos se usan solo para gestionar la cita.' },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: flowToken,
            flow_id: flowId,
            flow_cta: 'Reservar cita',
            flow_action: 'data_exchange',
            ...(draft ? { mode: 'draft' } : {}),
          },
        },
      },
    };
  }

  async process(input: {
    phoneNumberId: string;
    phone: string;
    messageId: string;
    text: string;
  }) {
    const { patientPhone, demoTenant } = resolvePatientPhone(
      this.config,
      input.phone,
    );
    const [route] = await this.database.query<{ tenant_id: string | null }[]>(
      'SELECT iam.whatsapp_connection_tenant($1) AS tenant_id',
      [input.phoneNumberId],
    );
    const tenantId = route?.tenant_id;
    if (!tenantId || (demoTenant && tenantId !== demoTenant))
      throw new ForbiddenException();
    const encryptedKey =
      this.config.get<string>('WHATSAPP_CREDENTIAL_KEY') ?? '';
    if (!/^[0-9a-f]{64}$/i.test(encryptedKey))
      throw new ServiceUnavailableException();
    const cipher = new WhatsappCredentialCrypto(encryptedKey);
    const body = {
      phone: patientPhone,
      messageId: input.messageId,
      text: input.text,
    };
    const prepared = await this.inTenant(tenantId, async () => {
      const rows = await this.tenancy.manager.query<
        { encrypted_access_token: string }[]
      >(
        `SELECT encrypted_access_token FROM public.whatsapp_tenant_connections
         WHERE tenant_id=$1 AND phone_number_id=$2 AND status='ready'`,
        [tenantId, input.phoneNumberId],
      );
      if (!rows.length) throw new ForbiddenException();
      const flowId = this.config.get<string>('WHATSAPP_FLOW_ID')?.trim() ?? '';
      const asFlow =
        /^\d{1,30}$/.test(flowId) && /^cita$/i.test(input.text.trim());
      if (asFlow) await this.deliveries.prepareFlow(body);
      const response = asFlow
        ? undefined
        : await this.conversation.process(body);
      const claim = await this.deliveries.claim(body);
      if (!claim.send || !claim.attempt) return { send: false as const };
      return {
        send: true as const,
        attempt: claim.attempt,
        token: cipher.decrypt(tenantId, rows[0].encrypted_access_token),
        response,
        flowId: asFlow ? flowId : undefined,
      };
    });
    if (!prepared.send) return { status: 'duplicate' as const };

    let result: 'sent' | 'uncertain' = 'uncertain';
    try {
      const payload = prepared.flowId
        ? this.flowPayload(
            input.phone.slice(1),
            prepared.flowId,
            signFlowToken(encryptedKey, {
              tenantId,
              phone: input.phone,
              phoneNumberId: input.phoneNumberId,
            }),
          )
        : whatsappMetaPayload(
            input.phone.slice(1),
            prepared.response!.reply,
            prepared.response!.menu,
          );
      const response = await fetch(
        `https://graph.facebook.com/v25.0/${input.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${prepared.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (response.ok) {
        const data: unknown = await response.json();
        const messages = (data as { messages?: unknown })?.messages;
        if (
          Array.isArray(messages) &&
          typeof messages[0]?.id === 'string' &&
          messages[0].id
        )
          result = 'sent';
      }
    } catch {
      /* The remote outcome is unknown: never retry automatically. */
    }
    await this.inTenant(tenantId, () =>
      this.deliveries.result({
        phone: patientPhone,
        messageId: input.messageId,
        attempt: prepared.attempt,
        result,
      }),
    );
    return { status: result };
  }
}
