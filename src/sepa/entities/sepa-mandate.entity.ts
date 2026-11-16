import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type ValueTransformer,
} from 'typeorm';

export type SepaMandateStatus = 'pendiente' | 'firmada' | 'cancelada';
export type SepaSignatureMethod = 'web' | 'certificate';

// What the creditor keeps as proof of consent (SEPA: for the life of the
// mandate + 14 months after the last debit).
export interface SepaSignatureEvidence {
  method: SepaSignatureMethod;
  signedAt: string; // ISO
  ip: string | null;
  userAgent: string | null;
  issuedPdfSha256: string;
  signedPdfSha256: string;
  // The creditor's certificate that signed the document before it reached the
  // client; null when none was configured at the time.
  creditorSeal?: {
    subject: string;
    serialNumber: string;
    sha256Fingerprint: string;
  } | null;
  // method 'web'
  typedName?: string;
  // method 'certificate'
  fileName?: string;
  // The signed upload begins with the exact bytes we issued (the normal case
  // for an appended PAdES signature). false = the signer re-saved the file.
  extendsIssuedPdf?: boolean;
}

// pg returns numeric columns as strings (to avoid float precision loss);
// the amounts here are small money values, safe as JS numbers.
const numeric: ValueTransformer = {
  to: (value: number) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

// One SEPA mandate per clinic — the clinic owner (or their company) is the
// debtor. See SepaMandates1736500000000.
@Entity({ schema: 'iam', name: 'sepa_mandates' })
export class SepaMandate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'integer' })
  number: number;

  // MED-0001-2026 — fixed at creation, never regenerated on edit.
  @Column()
  reference: string;

  // Debtor data (holder → email): the clinic owner fills it in through the
  // signing link, so it's empty until then — see SepaSigning1736600000000.
  // Account holder: the clinic owner or their company.
  @Column({ name: 'holder_name', type: 'text', nullable: true })
  holderName: string | null;

  @Column({ name: 'holder_tax_id', type: 'text', nullable: true })
  holderTaxId: string | null;

  @Column({ name: 'clinic_name' })
  clinicName: string;

  // Who signs: the holder themselves, or a company's representative.
  @Column({ name: 'signer_name', type: 'text', nullable: true })
  signerName: string | null;

  @Column({ name: 'signer_position', type: 'text', nullable: true })
  signerPosition: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'postal_code', type: 'text', nullable: true })
  postalCode: string | null;

  @Column({ type: 'text', nullable: true })
  city: string | null;

  @Column({ type: 'text', nullable: true })
  province: string | null;

  @Column({ type: 'text', nullable: true })
  country: string | null;

  @Column({ type: 'text', nullable: true })
  email: string | null;

  @Column({ type: 'text', nullable: true })
  phone: string | null;

  // Optional so a mandate can be prepared before the clinic hands over its
  // account — the PDF then prints empty boxes for it.
  @Column({ type: 'text', nullable: true })
  iban: string | null;

  @Column({ type: 'text', nullable: true })
  bic: string | null;

  @Column({ name: 'plan_name' })
  planName: string;

  @Column({
    name: 'monthly_base',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numeric,
  })
  monthlyBase: number;

  @Column({
    name: 'vat_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: numeric,
  })
  vatPercent: number;

  @Column({
    name: 'irpf_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: numeric,
  })
  irpfPercent: number;

  // "YYYY-MM-DD" — a `date` column, kept as a string (no timezone games).
  @Column({ name: 'first_charge_date', type: 'date' })
  firstChargeDate: string;

  @Column({ type: 'text', default: 'pendiente' })
  status: SepaMandateStatus;

  // SHA-256 of the current signing link's token; see SepaSigning1736600000000.
  // select:false everywhere — nothing outside the signing service reads it.
  @Column({ name: 'token_hash', type: 'text', nullable: true, select: false })
  tokenHash: string | null;

  @Column({ name: 'token_expires_at', type: 'timestamptz', nullable: true })
  tokenExpiresAt: Date | null;

  // The PDF as shown to the client, and the signed one. Never loaded by
  // default (select:false) — a few hundred KB each — only by the methods
  // that serve or verify them.
  @Column({ name: 'issued_pdf', type: 'bytea', nullable: true, select: false })
  issuedPdf: Buffer | null;

  @Column({ name: 'issued_at', type: 'timestamptz', nullable: true })
  issuedAt: Date | null;

  @Column({ name: 'signed_pdf', type: 'bytea', nullable: true, select: false })
  signedPdf: Buffer | null;

  @Column({ name: 'signed_at', type: 'timestamptz', nullable: true })
  signedAt: Date | null;

  @Column({ name: 'signature_method', type: 'text', nullable: true })
  signatureMethod: SepaSignatureMethod | null;

  @Column({ name: 'signature_evidence', type: 'jsonb', nullable: true })
  signatureEvidence: SepaSignatureEvidence | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
