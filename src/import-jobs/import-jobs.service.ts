import { Injectable, NotFoundException } from '@nestjs/common';
import { TenancyContext } from '../tenancy/tenancy-context';
import { ImportJob, ImportJobType } from './entities/import-job.entity';

export interface RowOutcome {
  created: boolean;
  reason?: string;
}

export interface ImportJobProgress {
  jobId: string;
  status: 'running' | 'completed';
  totalRows: number;
  processedRows: number;
  created: number;
  skipped: { row: number; reason: string }[];
}

function toProgress(job: ImportJob): ImportJobProgress {
  return {
    jobId: job.id,
    status: job.status,
    totalRows: job.totalRows,
    processedRows: job.cursor,
    created: job.createdCount,
    skipped: job.skipped,
  };
}

// See ImportJobs1735600000000 for why this exists: a bulk import used to
// run start-to-finish inside one HTTP request, which a large file (each
// row needing its own sequential DB round trips) blows through Vercel's
// 300s function timeout well before finishing. A job holds the
// already-parsed rows and a cursor; `advance()` processes one bounded
// batch and persists before returning, so PatientsService/
// ClinicalEntriesService can expose a "continue" endpoint the client
// polls — each call its own short unit of work, however many it takes.
@Injectable()
export class ImportJobsService {
  constructor(private readonly tenancyContext: TenancyContext) {}

  private get repo() {
    return this.tenancyContext.manager.getRepository(ImportJob);
  }

  async create(
    type: ImportJobType,
    rows: unknown[],
    extra: Record<string, unknown> | null = null,
  ): Promise<ImportJobProgress> {
    const job = this.repo.create({
      tenantId: this.tenancyContext.tenantId,
      type,
      rows,
      extra,
      totalRows: rows.length,
      status: rows.length === 0 ? 'completed' : 'running',
    });
    return toProgress(await this.repo.save(job));
  }

  private async findOrThrow(
    id: string,
    type: ImportJobType,
  ): Promise<ImportJob> {
    const job = await this.repo.findOne({ where: { id } });
    // RLS already keeps this tenant-scoped; the type check is just so a
    // patients jobId can't be fed to the clinical-entries continue route
    // (or vice versa) and silently process the wrong kind of row.
    if (!job || job.type !== type) {
      throw new NotFoundException('No existe ese trabajo de importación');
    }
    return job;
  }

  async getProgress(
    id: string,
    type: ImportJobType,
  ): Promise<ImportJobProgress> {
    return toProgress(await this.findOrThrow(id, type));
  }

  async advance<Row>(
    id: string,
    type: ImportJobType,
    batchSize: number,
    processRow: (
      row: Row,
      rowNumber: number,
      extra: Record<string, unknown> | null,
    ) => Promise<RowOutcome>,
  ): Promise<ImportJobProgress> {
    const job = await this.findOrThrow(id, type);
    if (job.status === 'completed') return toProgress(job);

    const end = Math.min(job.cursor + batchSize, job.totalRows);
    const skipped = [...job.skipped];
    let createdCount = job.createdCount;
    for (let i = job.cursor; i < end; i++) {
      const outcome = await processRow(job.rows[i] as Row, i + 1, job.extra);
      if (outcome.created) createdCount++;
      else
        skipped.push({ row: i + 1, reason: outcome.reason ?? 'Fila omitida' });
    }

    job.cursor = end;
    job.createdCount = createdCount;
    job.skipped = skipped;
    job.status = end >= job.totalRows ? 'completed' : 'running';
    return toProgress(await this.repo.save(job));
  }
}
