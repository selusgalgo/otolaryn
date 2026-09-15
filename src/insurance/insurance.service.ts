import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ClinicalEntry } from '../clinical-entries/entities/clinical-entry.entity';
import { Patient } from '../patients/entities/patient.entity';
import { TenancyContext } from '../tenancy/tenancy-context';
import { InsuranceEntity } from './entities/insurance-entity.entity';
import { CreateInsuranceEntityDto } from './dto/create-insurance-entity.dto';
import { UpdateInsuranceEntityDto } from './dto/update-insurance-entity.dto';

const UNIQUE_VIOLATION = '23505';

// insurance_entities lives in `public` with FORCE ROW LEVEL SECURITY (see
// migration 1733800000000-InsuranceEntities) — TenancyContext's RLS-scoped
// connection, never a plain @InjectRepository, same as antecedentes.
@Injectable()
export class InsuranceService {
  constructor(private readonly tenancyContext: TenancyContext) {}

  private get repo() {
    return this.tenancyContext.manager.getRepository(InsuranceEntity);
  }

  async findAll(): Promise<InsuranceEntity[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async create(dto: CreateInsuranceEntityDto): Promise<InsuranceEntity> {
    const entity = this.repo.create({
      tenantId: this.tenancyContext.tenantId,
      name: dto.name,
    });
    try {
      return await this.repo.save(entity);
    } catch (err) {
      throw this.mapWriteError(err);
    }
  }

  async update(
    id: string,
    dto: UpdateInsuranceEntityDto,
  ): Promise<InsuranceEntity> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('Aseguradora no encontrada');
    }
    this.repo.merge(entity, dto);
    try {
      return await this.repo.save(entity);
    } catch (err) {
      throw this.mapWriteError(err);
    }
  }

  // A hard delete only when no patient or clinical entry references it —
  // same "deleting a catalog entry must never orphan real data" rule as
  // AntecedentesService.removeType. Unlike antecedente_types, this table
  // has no `active` flag to fall back on: renaming is the only edit this
  // catalog needs, so there's nothing to "deactivate" instead.
  async remove(id: string): Promise<void> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('Aseguradora no encontrada');
    }
    const manager = this.tenancyContext.manager;
    const [usedByPatient, usedByEntry] = await Promise.all([
      manager.exists(Patient, { where: { insuranceEntityId: id } }),
      manager.exists(ClinicalEntry, { where: { insuranceEntityId: id } }),
    ]);
    if (usedByPatient || usedByEntry) {
      throw new ConflictException(
        'Esta aseguradora ya está asignada a algún paciente o consulta — no se puede eliminar.',
      );
    }
    await this.repo.delete({ id });
  }

  // Shared by the Pacientes/Consultas importers: resolves an ENTIDAD name
  // to an id, creating the row the first time that name is seen. Relies on
  // the tenant-scoped unique index on lower(name) — a race between two
  // concurrent imports creating the same new name is resolved by falling
  // back to a lookup on the unique-violation, not by locking.
  async findOrCreateByName(name: string): Promise<string> {
    const trimmed = name.trim();
    const existing = await this.repo
      .createQueryBuilder('e')
      .where('lower(e.name) = lower(:name)', { name: trimmed })
      .getOne();
    if (existing) {
      return existing.id;
    }
    try {
      const created = await this.repo.save(
        this.repo.create({
          tenantId: this.tenancyContext.tenantId,
          name: trimmed,
        }),
      );
      return created.id;
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as { code?: string }).code === UNIQUE_VIOLATION
      ) {
        const nowExisting = await this.repo
          .createQueryBuilder('e')
          .where('lower(e.name) = lower(:name)', { name: trimmed })
          .getOne();
        if (nowExisting) return nowExisting.id;
      }
      throw err;
    }
  }

  private mapWriteError(err: unknown): Error {
    if (
      err instanceof QueryFailedError &&
      (err as { code?: string }).code === UNIQUE_VIOLATION
    ) {
      return new ConflictException('Ya existe una aseguradora con ese nombre');
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
