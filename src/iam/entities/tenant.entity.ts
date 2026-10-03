import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ schema: 'iam', name: 'tenants' })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  // Schedule lives in ClinicHour (iam.clinic_hours), one row per open time
  // slot — see that entity.

  // Pre-fills a new appointment's duration (AppointmentsService.create(),
  // and the web form's own field) when the request doesn't specify one.
  // 5-480 is the same hard technical floor/ceiling CreateAppointmentDto
  // enforces on every appointment regardless of this setting — this is a
  // per-clinic default, not a replacement for that bound.
  @Column({ name: 'default_appointment_duration_minutes', type: 'smallint' })
  defaultAppointmentDurationMinutes: number;

  // Clinic identity shown on exported PDFs (ficha de paciente, tratamiento)
  // — see PdfController/patient-record-pdf.util.ts. All optional: a clinic
  // that hasn't configured these yet still gets a PDF, just without a logo
  // or an address/phone line.
  // Short subtitle under the clinic name in the PDF letterhead (e.g.
  // "Otorrinolaringología — Cirugía de cara y cuello").
  @Column({ type: 'text', nullable: true })
  tagline: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'text', nullable: true })
  phone: string | null;

  // A data: URI (base64), not a file path — see the migration's comment for
  // why. Expected to be small (logo images, not photos); the upload
  // endpoint enforces a size cap before it ever reaches this column.
  @Column({ type: 'text', nullable: true })
  logo: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
