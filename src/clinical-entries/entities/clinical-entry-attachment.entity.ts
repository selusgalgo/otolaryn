import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Metadatos de un archivo adjunto a una consulta (ver la migración
// ClinicalEntryAttachments). `storageKey` es interno: nunca se manda al cliente.
@Entity({ name: 'clinical_entry_attachments' })
export class ClinicalEntryAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'clinical_entry_id' })
  clinicalEntryId: string;

  @Column({ name: 'uploaded_by_user_id' })
  uploadedByUserId: string;

  @Column({ name: 'original_name' })
  originalName: string;

  @Column({ name: 'mime_type' })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'int' })
  sizeBytes: number;

  @Column({ name: 'storage_key' })
  storageKey: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
