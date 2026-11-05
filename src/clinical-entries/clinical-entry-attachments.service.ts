import type { ReadStream } from 'node:fs';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { In } from 'typeorm';
import {
  decodeUploadName,
  extensionFor,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_ENTRY,
  safeDisplayName,
  sniffMime,
} from '../attachments/attachment-file.util';
import { AttachmentStorage } from '../attachments/attachment-storage.service';
import { VirusScanService } from '../attachments/virus-scan.service';
import { TenancyContext } from '../tenancy/tenancy-context';
import { draftCutoff } from './clinical-entry-draft.util';
import { ClinicalEntryAttachment } from './entities/clinical-entry-attachment.entity';
import { ClinicalEntry } from './entities/clinical-entry.entity';

interface Viewer {
  userId: string;
  role: string;
}

export interface UploadedAttachmentFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

// Lo que se manda al cliente: nunca la `storageKey` (ruta interna en disco).
export interface AttachmentView {
  id: string;
  clinicalEntryId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByUserId: string;
  createdAt: Date;
}

function toView(a: ClinicalEntryAttachment): AttachmentView {
  return {
    id: a.id,
    clinicalEntryId: a.clinicalEntryId,
    originalName: a.originalName,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    uploadedByUserId: a.uploadedByUserId,
    createdAt: a.createdAt,
  };
}

// Archivos (PDF e imágenes) adjuntos a una consulta. Los ve quien ve la consulta
// (un borrador, solo su autor y los administradores); los añaden y quitan
// administradores y profesionales — y, en un borrador, solo su autor. Se admiten
// tanto en borradores como en consultas ya firmadas (un resultado puede llegar
// al día siguiente).
@Injectable()
export class ClinicalEntryAttachmentsService {
  constructor(
    private readonly tenancyContext: TenancyContext,
    private readonly storage: AttachmentStorage,
    private readonly scanner: VirusScanService,
  ) {}

  private get attachments() {
    return this.tenancyContext.manager.getRepository(ClinicalEntryAttachment);
  }

  private get entries() {
    return this.tenancyContext.manager.getRepository(ClinicalEntry);
  }

  // Misma visibilidad que la propia consulta: lo que no se puede ver es 404.
  private async visibleEntry(
    entryId: string,
    viewer: Viewer,
  ): Promise<ClinicalEntry> {
    const entry = await this.entries.findOne({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Consulta no encontrada');
    if (entry.status === 'borrador') {
      const allowed =
        (entry.authorUserId === viewer.userId || viewer.role === 'admin') &&
        !!entry.draftUpdatedAt &&
        entry.draftUpdatedAt > draftCutoff();
      if (!allowed) throw new NotFoundException('Consulta no encontrada');
    }
    return entry;
  }

  private assertCanModify(entry: ClinicalEntry, viewer: Viewer): void {
    if (viewer.role !== 'admin' && viewer.role !== 'profesional') {
      throw new ForbiddenException(
        'No tienes permiso para modificar los adjuntos',
      );
    }
    if (entry.status === 'borrador' && entry.authorUserId !== viewer.userId) {
      throw new ForbiddenException(
        'Solo el autor puede modificar los adjuntos de un borrador',
      );
    }
  }

  async list(entryId: string, viewer: Viewer): Promise<AttachmentView[]> {
    await this.visibleEntry(entryId, viewer);
    const rows = await this.attachments.find({
      where: { clinicalEntryId: entryId },
      order: { createdAt: 'ASC' },
    });
    return rows.map(toView);
  }

  async add(
    entryId: string,
    viewer: Viewer,
    file: UploadedAttachmentFile,
  ): Promise<AttachmentView> {
    const entry = await this.visibleEntry(entryId, viewer);
    this.assertCanModify(entry, viewer);

    if (
      file.size > MAX_ATTACHMENT_BYTES ||
      file.buffer.length > MAX_ATTACHMENT_BYTES
    ) {
      throw new PayloadTooLargeException(
        'El archivo supera el máximo de 10 MB',
      );
    }
    // El tipo sale del contenido, no de la extensión ni del Content-Type.
    const mime = sniffMime(file.buffer);
    if (!mime) {
      throw new UnsupportedMediaTypeException(
        'Solo se admiten PDF e imágenes (JPG, PNG o WebP)',
      );
    }
    const count = await this.attachments.count({
      where: { clinicalEntryId: entryId },
    });
    if (count >= MAX_ATTACHMENTS_PER_ENTRY) {
      throw new ConflictException(
        `Una consulta admite como máximo ${MAX_ATTACHMENTS_PER_ENTRY} archivos`,
      );
    }

    await this.scanner.assertClean(file.buffer);

    const key = await this.storage.save(
      this.tenancyContext.tenantId,
      entryId,
      extensionFor(mime),
      file.buffer,
    );
    try {
      const saved = await this.attachments.save(
        this.attachments.create({
          tenantId: this.tenancyContext.tenantId,
          clinicalEntryId: entryId,
          uploadedByUserId: viewer.userId,
          originalName: safeDisplayName(decodeUploadName(file.originalname)),
          mimeType: mime,
          sizeBytes: file.buffer.length,
          storageKey: key,
        }),
      );
      // Adjuntar es actividad: un borrador que se está completando no debe
      // caducar por eso.
      if (entry.status === 'borrador') {
        await this.entries.update(entry.id, { draftUpdatedAt: new Date() });
      }
      return toView(saved);
    } catch (err) {
      await this.storage.deleteMany([key]);
      throw err;
    }
  }

  async getFile(
    id: string,
    viewer: Viewer,
  ): Promise<{ attachment: AttachmentView; stream: ReadStream }> {
    const attachment = await this.attachments.findOne({ where: { id } });
    if (!attachment) throw new NotFoundException('Archivo no encontrado');
    await this.visibleEntry(attachment.clinicalEntryId, viewer);
    if (!(await this.storage.exists(attachment.storageKey))) {
      throw new NotFoundException('El archivo ya no está disponible');
    }
    return {
      attachment: toView(attachment),
      stream: this.storage.createReadStream(attachment.storageKey),
    };
  }

  async remove(id: string, viewer: Viewer): Promise<void> {
    const attachment = await this.attachments.findOne({ where: { id } });
    if (!attachment) throw new NotFoundException('Archivo no encontrado');
    const entry = await this.visibleEntry(attachment.clinicalEntryId, viewer);
    this.assertCanModify(entry, viewer);
    await this.attachments.delete(id);
    await this.storage.deleteMany([attachment.storageKey]);
  }

  // Claves de disco de los adjuntos de unas consultas: para borrar los archivos
  // cuando esas consultas se borran de verdad (descartar un borrador).
  async storageKeysFor(entryIds: string[]): Promise<string[]> {
    if (entryIds.length === 0) return [];
    const rows = await this.attachments.find({
      where: { clinicalEntryId: In(entryIds) },
      select: { storageKey: true },
    });
    return rows.map((r) => r.storageKey);
  }
}
