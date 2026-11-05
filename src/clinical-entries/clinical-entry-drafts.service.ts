import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttachmentStorage } from '../attachments/attachment-storage.service';
import { PatientsService } from '../patients/patients.service';
import { sanitizeRichText } from '../shared/rich-text.util';
import { TenancyContext } from '../tenancy/tenancy-context';
import { toVisitDate } from './clinical-entries.service';
import { ClinicalEntryAttachmentsService } from './clinical-entry-attachments.service';
import { draftCutoff, withDraftExpiry } from './clinical-entry-draft.util';
import { CreateClinicalEntryDto } from './dto/create-clinical-entry.dto';
import { SaveClinicalEntryDraftDto } from './dto/save-clinical-entry-draft.dto';
import { ClinicalEntry } from './entities/clinical-entry.entity';

interface Viewer {
  userId: string;
  role: string;
}

// Borradores de consulta (solo altas — editar una consulta ya firmada sigue
// siendo un PATCH directo, con el autoguardado local de la web). Visibles para
// su autor y para los administradores; solo el autor los edita y los firma,
// el autor o un administrador pueden descartarlos. Un borrador sin tocar
// durante DRAFT_TTL_DAYS deja de existir a todos los efectos (aquí se trata
// como "no encontrado") y lo borra ClinicalEntryDraftsPurgeService.
@Injectable()
export class ClinicalEntryDraftsService {
  constructor(
    private readonly tenancyContext: TenancyContext,
    private readonly patients: PatientsService,
    private readonly attachments: ClinicalEntryAttachmentsService,
    private readonly storage: AttachmentStorage,
  ) {}

  private get repo() {
    return this.tenancyContext.manager.getRepository(ClinicalEntry);
  }

  async create(
    patientId: string,
    authorUserId: string,
    dto: SaveClinicalEntryDraftDto,
  ) {
    // Lanza 404 si el paciente no existe o es de otra clínica (RLS lo oculta).
    await this.patients.findOne(patientId);

    const entry = this.repo.create({
      tenantId: this.tenancyContext.tenantId,
      patientId,
      authorUserId,
      status: 'borrador',
      draftUpdatedAt: new Date(),
      chiefComplaint: '',
      visitDate: new Date(),
    });
    this.applyFields(entry, dto, false);
    return withDraftExpiry(await this.repo.save(entry));
  }

  async update(id: string, userId: string, dto: SaveClinicalEntryDraftDto) {
    const entry = await this.findLiveDraft(id);
    this.assertAuthor(entry, userId);
    this.applyFields(entry, dto, false);
    entry.draftUpdatedAt = new Date();
    return withDraftExpiry(await this.repo.save(entry));
  }

  // Convierte el borrador en una consulta firmada con los valores del
  // formulario. Aquí sí se exige el motivo de consulta (CreateClinicalEntryDto),
  // igual que al crear una consulta directamente.
  async finalize(id: string, userId: string, dto: CreateClinicalEntryDto) {
    const entry = await this.findLiveDraft(id);
    this.assertAuthor(entry, userId);
    this.applyFields(entry, dto, true);
    entry.status = 'firmada';
    entry.draftUpdatedAt = null;
    return this.repo.save(entry);
  }

  async discard(id: string, viewer: Viewer): Promise<void> {
    const entry = await this.findLiveDraft(id);
    if (entry.authorUserId !== viewer.userId && viewer.role !== 'admin') {
      throw new ForbiddenException(
        'Solo el autor o un administrador pueden descartar este borrador',
      );
    }
    // Borrado real, no soft delete: un borrador no es historia clínica. Sus
    // adjuntos se van en cascada de la BD; los archivos de disco, después.
    const keys = await this.attachments.storageKeysFor([id]);
    await this.repo.delete(id);
    await this.storage.deleteMany(keys);
  }

  private async findLiveDraft(id: string): Promise<ClinicalEntry> {
    const entry = await this.repo.findOne({ where: { id } });
    if (
      !entry ||
      entry.status !== 'borrador' ||
      !entry.draftUpdatedAt ||
      entry.draftUpdatedAt <= draftCutoff()
    ) {
      throw new NotFoundException('Borrador no encontrado');
    }
    return entry;
  }

  private assertAuthor(entry: ClinicalEntry, userId: string): void {
    if (entry.authorUserId !== userId) {
      throw new ForbiddenException('Solo el autor puede editar este borrador');
    }
  }

  // replaceAll = true (firmar): lo que el formulario no envía queda vacío.
  // false (autoguardado): solo se tocan los campos presentes.
  private applyFields(
    entry: ClinicalEntry,
    dto: SaveClinicalEntryDraftDto,
    replaceAll: boolean,
  ): void {
    const rich = (value: string | undefined, current: string | null) =>
      value === undefined
        ? replaceAll
          ? null
          : current
        : value
          ? sanitizeRichText(value)
          : null;
    const plain = (value: string | undefined, current: string | null) =>
      value === undefined ? (replaceAll ? null : current) : value || null;

    if (dto.visitDate !== undefined)
      entry.visitDate = toVisitDate(dto.visitDate);
    if (dto.chiefComplaint !== undefined || replaceAll) {
      entry.chiefComplaint = sanitizeRichText(dto.chiefComplaint ?? '');
    }
    entry.examinationFindings = rich(
      dto.examinationFindings,
      entry.examinationFindings,
    );
    entry.diagnosis = plain(dto.diagnosis, entry.diagnosis);
    entry.treatment = rich(dto.treatment, entry.treatment);
    entry.followUpNotes = plain(dto.followUpNotes, entry.followUpNotes);
  }
}
