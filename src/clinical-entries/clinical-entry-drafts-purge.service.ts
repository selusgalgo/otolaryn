import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DRAFT_TTL_DAYS } from './clinical-entry-draft.util';

const FIRST_RUN_DELAY_MS = 60_000;
const RUN_EVERY_MS = 60 * 60 * 1000;

// Borra los borradores que llevan DRAFT_TTL_DAYS sin tocarse. clinical_entries
// tiene RLS por clínica, así que se recorre cada clínica fijando su contexto
// (la misma transacción con app.tenant_id que usa TenantContextInterceptor).
// Aunque este borrado fallara o no hubiera corrido, un borrador caducado ya no
// se lista ni se puede abrir (ver ClinicalEntryDraftsService.findLiveDraft).
// Sin dependencia de @nestjs/schedule: un temporizador por hora basta, y no
// arranca en tests.
@Injectable()
export class ClinicalEntryDraftsPurgeService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ClinicalEntryDraftsPurgeService.name);
  private first?: NodeJS.Timeout;
  private timer?: NodeJS.Timeout;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    const run = () =>
      this.purgeExpiredDrafts().catch((err: unknown) =>
        this.logger.error(
          `No se pudieron purgar los borradores: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    this.first = setTimeout(() => void run(), FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => void run(), RUN_EVERY_MS);
    this.first.unref();
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearTimeout(this.first);
    clearInterval(this.timer);
  }

  async purgeExpiredDrafts(): Promise<number> {
    const tenants = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM iam.tenants`,
    );
    let deleted = 0;
    for (const { id } of tenants) {
      const queryRunner = this.dataSource.createQueryRunner();
      try {
        await queryRunner.connect();
        await queryRunner.startTransaction();
        await queryRunner.query(
          `SELECT set_config('app.tenant_id', $1, true)`,
          [id],
        );
        // Resultado estructurado: con DELETE el driver de Postgres devuelve
        // otra forma que con SELECT, y `affected` es el recuento fiable.
        const result = (await queryRunner.query(
          `DELETE FROM public.clinical_entries
             WHERE status = 'borrador'
               AND draft_updated_at < now() - make_interval(days => $1)`,
          [DRAFT_TTL_DAYS],
          true,
        )) as { affected?: number };
        await queryRunner.commitTransaction();
        deleted += result.affected ?? 0;
      } catch (err) {
        await queryRunner.rollbackTransaction().catch(() => undefined);
        throw err;
      } finally {
        await queryRunner.release();
      }
    }
    if (deleted > 0) {
      this.logger.log(`Borradores caducados borrados: ${deleted}`);
    }
    return deleted;
  }
}
