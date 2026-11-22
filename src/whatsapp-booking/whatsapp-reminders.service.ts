import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';
import { withTenantSharedLock } from '../tenancy/tenant-operation-lock';
import { WhatsappCredentialCrypto } from './whatsapp-credential-crypto';

interface Reminder {
  id: string;
  scheduledAt: Date;
  scheduledAtKey: string;
  phone: string;
}

interface ReminderConnection {
  phoneNumberId: string;
  encryptedAccessToken: string;
  templateName: string;
  language: string;
}

@Injectable()
export class WhatsappRemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappRemindersService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.sendDue()
        .catch(() =>
          this.logger.error(
            'No se pudieron procesar los recordatorios de WhatsApp',
          ),
        )
        .finally(() => {
          this.running = false;
        });
    }, 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  private withinTenant<T>(
    tenantId: string,
    run: (manager: EntityManager) => Promise<T>,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenantId,
      ]);
      return run(manager);
    });
  }

  async sendDue() {
    const version =
      this.config.get<string>('WHATSAPP_REMINDER_GRAPH_VERSION')?.trim() ||
      'v25.0';
    const encryptionKey =
      this.config.get<string>('WHATSAPP_CREDENTIAL_KEY') ?? '';
    if (!/^v\d+\.0$/.test(version) || !/^[0-9a-f]{64}$/i.test(encryptionKey))
      return;

    const cipher = new WhatsappCredentialCrypto(encryptionKey);
    const tenants = await this.dataSource.query<{ tenant_id: string }[]>(
      'SELECT tenant_id FROM iam.whatsapp_reminder_tenants()',
    );
    for (const { tenant_id: tenantId } of tenants) {
      if (!isUUID(tenantId)) continue;
      try {
        await this.sendDueForTenant(tenantId, version, cipher);
      } catch {
        this.logger.error(
          'No se pudieron procesar los recordatorios de WhatsApp de una clínica',
        );
      }
    }
  }

  private async sendDueForTenant(
    tenantId: string,
    version: string,
    cipher: WhatsappCredentialCrypto,
  ) {
    // Hold one shared tenant lock across claim, provider call, and result write.
    // Inner transactions set the RLS tenant context without acquiring the lock again.
    await withTenantSharedLock(this.dataSource, tenantId, async () => {
      const [connection] = await this.withinTenant(tenantId, (manager) =>
        manager.query<ReminderConnection[]>(
          `SELECT c.phone_number_id AS "phoneNumberId",
                  c.encrypted_access_token AS "encryptedAccessToken",
                  s.features->>'reminderTemplateName' AS "templateName",
                  s.features->>'reminderTemplateLanguage' AS language
           FROM public.whatsapp_tenant_connections c
           JOIN iam.whatsapp_booking_settings s ON s.tenant_id = c.tenant_id
           WHERE c.tenant_id = $1 AND c.status = 'ready'
             AND s.platform_enabled = true AND s.clinic_enabled = true
             AND COALESCE((s.features->>'reminderHours')::integer, 0) > 0
             AND COALESCE(s.features->>'reminderTemplateName', '') ~ '^[a-z][a-z0-9_]{0,127}$'
             AND COALESCE(s.features->>'reminderTemplateLanguage', '') ~ '^[a-z]{2,3}(_[A-Z]{2})?$'`,
          [tenantId],
        ),
      );
      if (
        !connection ||
        !/^\d{1,30}$/.test(connection.phoneNumberId) ||
        !/^[a-z][a-z0-9_]{0,127}$/.test(connection.templateName) ||
        !/^[a-z]{2,3}(_[A-Z]{2})?$/.test(connection.language)
      )
        return;

      let token: string;
      try {
        token = cipher.decrypt(tenantId, connection.encryptedAccessToken);
      } catch {
        this.logger.error(
          'No se pudo descifrar la conexión de WhatsApp de una clínica',
        );
        return;
      }

      for (let i = 0; i < 5; i++) {
        const [reminder] = await this.withinTenant(tenantId, (manager) =>
          manager.query<Reminder[]>(
            `WITH due AS (
           SELECT a.id, a.scheduled_at, a.whatsapp_reminder_phone AS phone
           FROM public.appointments a
           JOIN iam.whatsapp_booking_settings s ON s.tenant_id = a.tenant_id
           WHERE a.tenant_id = $1 AND s.platform_enabled AND s.clinic_enabled
             AND a.deleted_at IS NULL AND a.status = 'scheduled' AND a.booking_source = 'whatsapp'
             AND a.whatsapp_reminder_phone ~ '^\\+[1-9][0-9]{7,14}$' AND a.scheduled_at > now()
             AND COALESCE((s.features->>'reminderHours')::integer, 0) > 0
             AND COALESCE(s.features->>'reminderTemplateName', '') ~ '^[a-z][a-z0-9_]{0,127}$'
             AND COALESCE(s.features->>'reminderTemplateLanguage', '') ~ '^[a-z]{2,3}(_[A-Z]{2})?$'
             AND a.scheduled_at - make_interval(hours => (s.features->>'reminderHours')::integer)
                 BETWEEN now() - interval '15 minutes' AND now()
             AND NOT EXISTS (SELECT 1 FROM public.whatsapp_booking_reminders r
               WHERE r.tenant_id = a.tenant_id AND r.appointment_id = a.id AND r.scheduled_at = a.scheduled_at)
           ORDER BY a.scheduled_at LIMIT 1 FOR UPDATE OF a SKIP LOCKED
         ), claimed AS (
           INSERT INTO public.whatsapp_booking_reminders (tenant_id, appointment_id, scheduled_at, status)
           SELECT $1, id, scheduled_at, 'sending' FROM due ON CONFLICT DO NOTHING
           RETURNING appointment_id
         )
         SELECT due.id, due.scheduled_at AS "scheduledAt",
           due.scheduled_at::text AS "scheduledAtKey", due.phone
         FROM due JOIN claimed ON claimed.appointment_id = due.id`,
            [tenantId],
          ),
        );
        if (!reminder) return;

        const date = new Intl.DateTimeFormat('es-ES', {
          timeZone: 'Europe/Madrid',
          dateStyle: 'full',
          timeStyle: 'short',
        }).format(reminder.scheduledAt);
        let status: 'accepted' | 'failed' | 'uncertain' = 'uncertain';
        try {
          const response = await fetch(
            `https://graph.facebook.com/${version}/${connection.phoneNumberId}/messages`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              redirect: 'error',
              signal: AbortSignal.timeout(10_000),
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: reminder.phone.slice(1),
                type: 'template',
                template: {
                  name: connection.templateName,
                  language: { code: connection.language },
                  components: [
                    {
                      type: 'body',
                      parameters: [{ type: 'text', text: date }],
                    },
                  ],
                },
              }),
            },
          );
          if (response.ok) {
            const data = (await response.json()) as {
              messages?: { id?: string }[];
            };
            if (data.messages?.[0]?.id) status = 'accepted';
          } else if (response.status < 500) status = 'failed';
        } catch {
          // An uncertain send is left for review to avoid duplicates.
        }
        await this.withinTenant(tenantId, (manager) =>
          manager.query(
            `UPDATE public.whatsapp_booking_reminders SET status = $4
         WHERE tenant_id = $1 AND appointment_id = $2 AND scheduled_at = $3`,
            [tenantId, reminder.id, reminder.scheduledAtKey, status],
          ),
        );
      }
    });
  }
}
