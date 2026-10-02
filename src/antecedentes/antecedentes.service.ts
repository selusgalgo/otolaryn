import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { In, QueryFailedError } from 'typeorm';
import { PatientsService } from '../patients/patients.service';
import { TenancyContext } from '../tenancy/tenancy-context';
import { AntecedenteType } from './entities/antecedente-type.entity';
import { PatientAntecedente } from './entities/patient-antecedente.entity';
import { CreateAntecedenteTypeDto } from './dto/create-antecedente-type.dto';
import { UpdateAntecedenteTypeDto } from './dto/update-antecedente-type.dto';
import { UpdatePatientAntecedentesDto } from './dto/update-patient-antecedentes.dto';

const UNIQUE_VIOLATION = '23505';

// antecedente_types / patient_antecedentes live in `public` with FORCE ROW
// LEVEL SECURITY (see migration 1733900000000-PatientAntecedentes) — same
// as patients/clinical_entries, so this goes through TenancyContext's
// RLS-scoped connection, never a plain @InjectRepository.
@Injectable()
export class AntecedentesService {
  constructor(
    private readonly tenancyContext: TenancyContext,
    private readonly patients: PatientsService,
  ) {}

  private get typesRepo() {
    return this.tenancyContext.manager.getRepository(AntecedenteType);
  }

  private get patientAntecedentesRepo() {
    return this.tenancyContext.manager.getRepository(PatientAntecedente);
  }

  async findAllTypes(): Promise<AntecedenteType[]> {
    return this.typesRepo.find({ order: { displayOrder: 'ASC' } });
  }

  async createType(dto: CreateAntecedenteTypeDto): Promise<AntecedenteType> {
    const type = this.typesRepo.create({
      tenantId: this.tenancyContext.tenantId,
      name: dto.name,
      category: dto.category ?? 'personal',
    });
    try {
      return await this.typesRepo.save(type);
    } catch (err) {
      throw this.mapWriteError(err);
    }
  }

  async updateType(
    id: string,
    dto: UpdateAntecedenteTypeDto,
  ): Promise<AntecedenteType> {
    const type = await this.typesRepo.findOne({ where: { id } });
    if (!type) {
      throw new NotFoundException('Antecedente no encontrado');
    }
    this.typesRepo.merge(type, dto);
    try {
      return await this.typesRepo.save(type);
    } catch (err) {
      throw this.mapWriteError(err);
    }
  }

  // A hard delete only when nothing already references this type — a
  // patient's marked antecedente must never silently disappear because
  // someone tidied up the catalog. Deactivating (active: false, via
  // updateType) is always available and hides it from new selections
  // without touching history.
  async removeType(id: string): Promise<void> {
    const type = await this.typesRepo.findOne({ where: { id } });
    if (!type) {
      throw new NotFoundException('Antecedente no encontrado');
    }
    const inUse = await this.patientAntecedentesRepo.exists({
      where: { antecedenteTypeId: id },
    });
    if (inUse) {
      throw new ConflictException(
        'Este antecedente ya está marcado en algún paciente — desactívalo en vez de eliminarlo.',
      );
    }
    await this.typesRepo.delete({ id });
  }

  async findForPatient(patientId: string): Promise<PatientAntecedente[]> {
    // Existence/tenant check only, same as ClinicalEntriesService —
    // clinical staff can read/write a patient's history regardless of the
    // "own patients" narrowing that only applies to the patients list.
    await this.patients.findOne(patientId);
    return this.patientAntecedentesRepo.find({ where: { patientId } });
  }

  async replaceForPatient(
    patientId: string,
    dto: UpdatePatientAntecedentesDto,
  ): Promise<PatientAntecedente[]> {
    await this.patients.findOne(patientId);

    const typeIds = dto.items.map((item) => item.antecedenteTypeId);
    let types: AntecedenteType[] = [];
    if (typeIds.length > 0) {
      types = await this.typesRepo.find({ where: { id: In(typeIds) } });
      if (types.length !== new Set(typeIds).size) {
        throw new BadRequestException(
          'Alguno de los antecedentes indicados no existe',
        );
      }
      if (dto.category && types.some((t) => t.category !== dto.category)) {
        throw new BadRequestException(
          'Alguno de los antecedentes indicados no pertenece a esta categoría',
        );
      }
    }

    // Full replace inside one transaction — same "the whole form submits
    // its current state" shape as SettingsService.updateSchedule, simpler
    // and correct for a checklist that submits all at once. Scoped to
    // dto.category when given, so saving Antecedentes personales never
    // touches whatever Antecedentes familiares already had marked (and
    // vice versa) — see the DTO comment for the no-category fallback.
    await this.tenancyContext.manager.transaction(async (manager) => {
      if (dto.category) {
        const typeIdsInCategory = await manager
          .getRepository(AntecedenteType)
          .find({ where: { category: dto.category }, select: ['id'] });
        if (typeIdsInCategory.length > 0) {
          await manager.delete(PatientAntecedente, {
            patientId,
            antecedenteTypeId: In(typeIdsInCategory.map((t) => t.id)),
          });
        }
      } else {
        await manager.delete(PatientAntecedente, { patientId });
      }
      if (dto.items.length > 0) {
        await manager.insert(
          PatientAntecedente,
          dto.items.map((item) => ({
            tenantId: this.tenancyContext.tenantId,
            patientId,
            antecedenteTypeId: item.antecedenteTypeId,
            detalle: item.detalle ?? null,
          })),
        );
      }
    });

    return this.findForPatient(patientId);
  }

  private mapWriteError(err: unknown): Error {
    if (
      err instanceof QueryFailedError &&
      (err as { code?: string }).code === UNIQUE_VIOLATION
    ) {
      return new ConflictException('Ya existe un antecedente con ese nombre');
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
