export type PatientGender = "hombre" | "mujer";

export const PATIENT_GENDER_LABEL: Record<PatientGender, string> = {
  hombre: "Hombre",
  mujer: "Mujer",
};

export type HolderRelationship = "hijo" | "conyuge" | "otro";

export const HOLDER_RELATIONSHIP_LABEL: Record<HolderRelationship, string> = {
  hijo: "Hijo/a",
  conyuge: "Cónyuge",
  otro: "Otro",
};

export interface PatientLinkSummary {
  id: string;
  firstName: string;
  lastName: string;
  documentId: string | null;
  legacyId: string | null;
}

export interface Patient {
  creationSource?: "unknown" | "manual" | "import" | "whatsapp";
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  documentId: string | null;
  // null en un paciente importado de un fichero legado que no traía fecha o
  // teléfono. El alta manual los sigue exigiendo.
  dateOfBirth: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  notes: string | null;
  profession: string | null;
  drugAllergies: string | null;
  currentMedications: string | null;
  legacyId: string | null;
  insuranceEntityId: string | null;
  // Nº de tarjeta/póliza en la aseguradora privada.
  insuranceNumber: string | null;
  // null = sin indicar.
  gender: PatientGender | null;
  // Familiar a cargo: su titular y el parentesco (ambos null si no lo es).
  holderPatientId: string | null;
  holderRelationship: HolderRelationship | null;
  // Solo en GET /patients/:id: el titular y los familiares a cargo.
  holder?: PatientLinkSummary | null;
  dependents?: (PatientLinkSummary & { holderRelationship: HolderRelationship | null })[];
  // Manually editable — see the backend DTO comment for why this exists
  // alongside the computed value below instead of replacing it.
  firstConsultationOverride: string | null;
  // Computed (MIN of clinical_entries.visit_date) unless firstConsultationOverride
  // is set and earlier — see PatientsService.findOneWithFirstConsultationDate.
  // Only present on GET /patients/:id, not on list/search results.
  firstConsultationDate: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface WhatsappBookingSettings {
  platformEnabled: boolean;
  clinicEnabled: boolean;
  askReason: boolean;
  horizonDays: number;
  leadMinutes: number;
  cancellationEnabled: boolean;
  cancellationNoticeHours: number;
  features: {
    welcome: string;
    receptionPhone: string;
    receptionHours: string;
    reschedule: boolean;
    notifyReception: boolean;
    reminderHours: number;
    reminderTemplateName: string;
    reminderTemplateLanguage: string;
    visitTypes: { id: string; name: string; durationMinutes: number; practitionerIds: string[] }[];
    restrictHours: boolean;
    hours: { weekday: number; start: string; end: string }[];
  };
  practitionerIds: string[];
}

export interface ClinicalEntry {
  id: string;
  tenantId: string;
  patientId: string;
  authorUserId: string;
  visitDate: string;
  chiefComplaint: string;
  examinationFindings: string | null;
  diagnosis: string | null;
  treatment: string | null;
  followUpNotes: string | null;
  // Plantilla de cirugía (ver lib/consultation-template.ts).
  evolution: string | null;
  report: string | null;
  referringDoctor: string | null;
  // Resolved by the backend from authorUserId regardless of that user's
  // current active status — unlike the "bookable" practitioner list used
  // for picking who to book a new appointment with, a past consulta's
  // author should keep showing correctly even once they're deactivated.
  // Present on GET /patients/:patientId/clinical-entries (list) and on
  // GET /clinical-entries/:id; null if the author's own row is somehow gone.
  authorName: string | null;
  // "Dr." o "Dra." del autor, resuelto junto a authorName (misma consulta,
  // mismo caso de null).
  authorHonorific: Honorific | null;
  // "borrador" mientras se está escribiendo (solo lo ven su autor y los
  // administradores; se borra solo a los 10 días sin tocarlo), "firmada" para
  // toda consulta que cuenta en la historia clínica.
  status: "borrador" | "firmada";
  // Cuándo se borrará el borrador si nadie lo toca; null si está firmada.
  draftExpiresAt: string | null;
  // Archivos adjuntos (PDF e imágenes). Solo viene en el listado de la ficha.
  attachmentCount?: number;
  createdAt: string;
}

export interface ClinicalEntryAttachment {
  id: string;
  clinicalEntryId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByUserId: string;
  createdAt: string;
}

export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

export interface Appointment {
  id: string;
  tenantId: string;
  patientId: string;
  practitionerId: string | null;
  // Resolved by the backend from practitionerId regardless of that user's
  // current active status — see ClinicalEntry.authorName for the same
  // reasoning. Only present on GET /appointments (list).
  practitionerName: string | null;
  // "Dr." o "Dra." del profesional, resuelto junto a practitionerName.
  practitionerHonorific: Honorific | null;
  scheduledAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  notes: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type Role = "superadmin" | "admin" | "profesional" | "recepcion";

// Only meaningful when role is "admin" — an owner/manager who also
// practices or also staffs the front desk, without losing admin access.
export type StaffFunction = "profesional" | "recepcion";

// Cómo se antepone el nombre de un médico en pantalla. Solo se usa con quien
// ejerce como médico; "Dr." por defecto.
export type Honorific = "Dr." | "Dra.";

export interface Me {
  firstName: string;
  lastName: string;
  role: Role;
  // Only meaningful for role "profesional" — always true for every other
  // role. An admin-controlled toggle, not tied to `active`.
  agendaAccess: boolean;
  // Con el rol y la función adicional se sabe si el usuario actual ejerce como
  // médico, y con el tratamiento cómo se antepone su nombre ("Dr."/"Dra.").
  honorific: Honorific;
  staffFunction: StaffFunction | null;
}

export interface TodayDashboard {
  // Omitted (null), not just empty, for a profesional an admin has turned
  // Agenda access off for — see AgendaAccessGuard on the backend.
  appointments: Appointment[] | null;
  // Omitted (null), not just empty, for recepcion — that role has no
  // access to clinical content at all.
  clinicalEntries: ClinicalEntry[] | null;
  // Borradores de consulta pendientes (los propios; todos los de la clínica
  // para un administrador). null para recepción, que no los ve nunca.
  drafts: ClinicalEntry[] | null;
}

export interface AppUser {
  id: string;
  tenantId: string | null;
  email: string;
  username: string | null;
  firstName: string;
  lastName: string;
  role: Role;
  staffFunction: StaffFunction | null;
  honorific: Honorific;
  active: boolean;
  agendaAccess: boolean;
  createdAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  createdAt: string;
}

export interface AccountProfile {
  firstName: string;
  lastName: string;
  username: string | null;
  email: string;
  role: Role;
}

// Weekly recurring, whole-clinic schedule — index 0=Monday..6=Sunday. A day
// with an empty slots array is closed.
export interface TimeSlot {
  startTime: string;
  endTime: string;
}

export interface DaySchedule {
  weekday: number;
  slots: TimeSlot[];
}

export interface Schedule {
  days: DaySchedule[];
}

export interface TenantSchedule extends Schedule {
  tenantName: string;
}

// Pre-fills a new appointment's Duración field — see
// AppointmentsService.create() and Configuración → Citas.
export interface AppointmentDefaults {
  defaultDurationMinutes: number;
}

export interface TenantAppointmentDefaults extends AppointmentDefaults {
  tenantName: string;
}

// Identity shown on exported PDFs (ficha de paciente, tratamiento) — see
// Configuración → Perfil de la clínica. logo is a data: URI (base64) or
// null, never a file path/URL — see the backend's own comment on
// Tenant.logo for why.
export interface ClinicProfile {
  name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  logo: string | null;
}

// Panel Eiduo → Datos de facturación: who collects Mederi's fees, printed as
// "Acreedor" on every SEPA mandate (backend: CreditorProfile).
export interface CreditorProfile {
  name: string;
  taxId: string;
  address: string;
  postalCode: string;
  city: string;
  province: string;
  country: string;
  email: string;
  phone: string;
  website: string | null;
  sepaCreditorId: string;
}

// State of the digital certificate (.p12) the server signs documents with —
// see PdfSignerService on the backend. Dates arrive as ISO strings.
// `source`: uploaded from this panel, or set in the server's environment.
export type CertificateSource = "upload" | "env";

export type CreditorCertificateStatus =
  | { configured: false }
  | { configured: true; usable: false; error: string; source: CertificateSource }
  | {
      configured: true;
      usable: true;
      source: CertificateSource;
      certificate: {
        subject: string;
        subjectSerial: string | null;
        issuer: string;
        serialNumber: string;
        sha256Fingerprint: string;
        validFrom: string;
        validTo: string;
      };
      daysLeft: number;
      expiringSoon: boolean;
      // false = issued to a different NIF than the creditor on the mandates.
      matchesCreditorTaxId: boolean;
    };

export type SepaMandateStatus = "pendiente" | "firmada" | "cancelada";
export type SepaSignatureMethod = "web" | "certificate";

// What the creditor keeps as proof of consent for a signed mandate.
export interface SepaSignatureEvidence {
  method: SepaSignatureMethod;
  signedAt: string;
  ip: string | null;
  userAgent: string | null;
  issuedPdfSha256: string;
  signedPdfSha256: string;
  // Certificate that signed the document before it reached the client; null
  // when none was configured at the time.
  creditorSeal?: { subject: string; serialNumber: string; sha256Fingerprint: string } | null;
  typedName?: string;
  fileName?: string;
  // Certificate route: the signed file begins with the exact bytes we issued.
  // false means the signer re-saved the document — worth a manual look.
  extendsIssuedPdf?: boolean;
}

// One per clinic — the clinic owner (or their company) is the debtor.
// reference (MED-0001-2026) is assigned by the API on creation, never sent.
// The debtor data (holderName … bic) is filled in by the client through the
// signing link, so it's null until then.
export interface SepaMandate {
  id: string;
  reference: string;
  status: SepaMandateStatus;
  holderName: string | null;
  holderTaxId: string | null;
  clinicName: string;
  signerName: string | null;
  signerPosition: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  iban: string | null;
  bic: string | null;
  planName: string;
  monthlyBase: number;
  vatPercent: number;
  irpfPercent: number;
  firstChargeDate: string; // YYYY-MM-DD
  tokenExpiresAt: string | null;
  issuedAt: string | null;
  signedAt: string | null;
  signatureMethod: SepaSignatureMethod | null;
  signatureEvidence: SepaSignatureEvidence | null;
  cancelledAt: string | null;
  updatedAt: string;
}

export interface TenantSepaMandate {
  tenantName: string;
  clinicDefaults: { clinicName: string; phone: string | null };
  mandate: SepaMandate | null;
}

// What the public signing page (/sepa/[token]) receives — see
// PublicSepaView on the backend.
export interface PublicSepaView {
  status: "pendiente" | "firmada";
  reference: string;
  clinicName: string;
  planName: string;
  firstChargeDate: string;
  amounts: { baseCents: number; vatCents: number; irpfCents: number; totalCents: number };
  vatPercent: number;
  irpfPercent: number;
  creditor: {
    name: string;
    taxId: string;
    address: string;
    postalCode: string;
    city: string;
    province: string;
    email: string;
    phone: string;
    website: string | null;
    sepaCreditorId: string;
  };
  debtor: {
    holderName: string | null;
    holderTaxId: string | null;
    signerName: string | null;
    signerPosition: string | null;
    address: string | null;
    postalCode: string | null;
    city: string | null;
    province: string | null;
    country: string | null;
    email: string | null;
    phone: string | null;
    iban: string | null;
    bic: string | null;
  };
  readyToSign: boolean;
  issuedAt: string | null;
  signedAt: string | null;
  signatureMethod: SepaSignatureMethod | null;
  expiresAt: string | null;
}

// Configuración → Seguridad — see Tenant.deviceLockEnabled/deviceSecretHash.
// hasCredential never exposes the secret itself, just whether one exists
// (the raw token is only ever returned once, by generateDeviceCredential).
export interface DeviceLock {
  enabled: boolean;
  hasCredential: boolean;
}

export type AntecedenteCategory = "personal" | "familiar";

export interface AntecedenteType {
  id: string;
  tenantId: string;
  name: string;
  category: AntecedenteCategory;
  active: boolean;
  displayOrder: number;
}

// The row's mere presence in a patient's list means "marcado" — see the
// backend entity comment (patient-antecedente.entity.ts).
export interface PatientAntecedente {
  id: string;
  tenantId: string;
  patientId: string;
  antecedenteTypeId: string;
  detalle: string | null;
  createdAt: string;
}

export interface InsuranceEntity {
  id: string;
  tenantId: string;
  name: string;
  createdAt: string;
}
