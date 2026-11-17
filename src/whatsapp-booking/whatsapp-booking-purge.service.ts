import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';

@Injectable()
export class WhatsappBookingPurgeService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WhatsappBookingPurgeService.name);
  private first?: NodeJS.Timeout;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    const run = () => {
      if (this.running) return;
      this.running = true;
      void this.purgeExpired()
        .catch((error: unknown) => {
          this.logger.error(
            `No se pudieron borrar las conversaciones caducadas: ${error instanceof Error ? error.message : String(error)}`,
          );
        })
        .finally(() => {
          this.running = false;
        });
    };
    this.first = setTimeout(run, 60_000);
    this.timer = setInterval(run, 15 * 60_000);
    this.first.unref();
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearTimeout(this.first);
    clearInterval(this.timer);
  }

  async purgeExpired(): Promise<void> {
    const tenantId =
      this.config.get<string>('WHATSAPP_BOOKING_TENANT_ID') ?? '';
    if (!isUUID(tenantId)) return;
    const runner = this.dataSource.createQueryRunner();
    try {
      await runner.connect();
      await runner.startTransaction();
      await runner.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenantId,
      ]);
      await runner.query(
        "DELETE FROM public.whatsapp_booking_sessions WHERE tenant_id = $1 AND updated_at < now() - interval '30 minutes'",
        [tenantId],
      );
      await runner.query(
        "DELETE FROM public.whatsapp_booking_receipts WHERE tenant_id = $1 AND created_at < now() - interval '24 hours'",
        [tenantId],
      );
      await runner.commitTransaction();
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }
}
