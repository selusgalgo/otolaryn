import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const PATIENT_GENDERS = ['hombre', 'mujer'] as const;
export type PatientGender = (typeof PATIENT_GENDERS)[number];

export const HOLDER_RELATIONSHIPS = ['hijo', 'conyuge', 'otro'] as const;
export type HolderRelationship = (typeof HOLDER_RELATIONSHIPS)[number];

@Entity({ name: 'patients' })
export class Patient {
  @Column({ name: 'creation_source', type: 'text', default: 'unknown' })
  creationSource: 'unknown' | 'manual' | 'import' | 'whatsapp';

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ name: 'document_id', type: 'text', nullable: true })
  documentId: string | null;

  // Nullable desde PatientBirthDatePhoneOptional1737700000000: una fila
  // importada de un fichero legado puede venir sin fecha o sin teléfono. El
  // alta manual los sigue exigiendo (CreatePatientDto).
  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ type: 'text', nullable: true })
  phone: string | null;

  @Column({ name: 'phone2', type: 'text', nullable: true })
  phone2: string | null;

  @Column({ type: 'text', nullable: true })
  email: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'text', nullable: true })
  city: string | null;

  @Column({ type: 'text', nullable: true })
  province: string | null;

  @Column({ name: 'postal_code', type: 'text', nullable: true })
  postalCode: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // "Número de historia" — originally NUMHISTORIA from the legacy
  // OTOLARYN desktop app, set only for patients brought in by the
  // historical data migration. Since 24/09/2026 (PatientsService.create,
  // PatientNumberCounters1734700000000) it's also auto-assigned for every
  // new patient created directly in the app, continuing the SAME per-tenant
  // sequence — nullable is now only a historical leftover for patients
  // created before that date, not a "legacy-only" marker.
  @Column({ name: 'legacy_id', type: 'text', nullable: true })
  legacyId: string | null;

  @Column({ name: 'insurance_entity_id', type: 'uuid', nullable: true })
  insuranceEntityId: string | null;

  // Nº de tarjeta/póliza en la aseguradora privada de arriba — ver
  // PatientGenderInsuranceNumber1737800000000.
  @Column({ name: 'insurance_number', type: 'text', nullable: true })
  insuranceNumber: string | null;

  // null = sin indicar (todos los pacientes anteriores a la migración).
  @Column({ type: 'text', nullable: true })
  gender: PatientGender | null;

  // Familiar a cargo de otro paciente (PatientHolder1738000000000): su
  // titular y el parentesco. Ambos null = no es familiar a cargo de nadie.
  // PatientsService.assertHolder valida las reglas que la BD no puede.
  @Column({ name: 'holder_patient_id', type: 'uuid', nullable: true })
  holderPatientId: string | null;

  @Column({ name: 'holder_relationship', type: 'text', nullable: true })
  holderRelationship: HolderRelationship | null;

  // PROFESION from the legacy app.
  @Column({ type: 'text', nullable: true })
  profession: string | null;

  // Manual override for "fecha de primera consulta" — see
  // PatientsService.findOneWithFirstConsultationDate for why this exists
  // alongside the computed value instead of replacing it.
  @Column({ name: 'first_consultation_override', type: 'date', nullable: true })
  firstConsultationOverride: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
