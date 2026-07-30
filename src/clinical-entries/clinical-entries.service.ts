import { Injectable, NotFoundException } from '@nestjs/common';
import { PaginatedResult, PatientsService } from '../patients/patients.service';
import { TenancyContext } from '../tenancy/tenancy-context';
import { CreateClinicalEntryDto } from './dto/create-clinical-entry.dto';
import { ClinicalEntry } from './entities/clinical-entry.entity';

@Injectable()
export class ClinicalEntriesService {
  constructor(
    private readonly tenancyContext: TenancyContext,
    private readonly patients: PatientsService,
  ) {}

  private get repo() {
    // No explicit WHERE tenant_id here on purpose: RLS is what must filter
    // this, not application code remembering to.
    return this.tenancyContext.manager.getRepository(ClinicalEntry);
  }

  async create(
    patientId: string,
    authorUserId: string,
    dto: CreateClinicalEntryDto,
  ): Promise<ClinicalEntry> {
    // Throws NotFoundException if the patient doesn't exist or belongs to
    // another tenant (RLS hides it either way) — this is also what makes
    // the FK on (patient_id, tenant_id) succeed below.
    await this.patients.findOne(patientId);

    const entry = this.repo.create({
      tenantId: this.tenancyContext.tenantId,
      patientId,
      authorUserId,
      chiefComplaint: dto.chiefComplaint,
      examinationFindings: dto.examinationFindings ?? null,
      diagnosis: dto.diagnosis ?? null,
      treatment: dto.treatment ?? null,
      followUpNotes: dto.followUpNotes ?? null,
      visitDate: dto.visitDate ? new Date(dto.visitDate) : new Date(),
    });
    return this.repo.save(entry);
  }

  async findAllForPatient(
    patientId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<ClinicalEntry>> {
    await this.patients.findOne(patientId);

    const [data, total] = await this.repo.findAndCount({
      where: { patientId },
      order: { visitDate: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { data, total, page, pageSize };
  }

  async findOne(id: string): Promise<ClinicalEntry> {
    const entry = await this.repo.findOne({ where: { id } });
    if (!entry) {
      throw new NotFoundException('Clinical entry not found');
    }
    return entry;
  }
}
