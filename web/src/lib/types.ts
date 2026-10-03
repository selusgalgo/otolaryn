export interface Patient {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  documentId: string | null;
  dateOfBirth: string;
  phone: string;
  phone2: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  notes: string | null;
  profession: string | null;
  legacyId: string | null;
  insuranceEntityId: string | null;
  firstConsultationDate: string | null;
  createdAt: string;
  deletedAt: string | null;
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
  createdAt: string;
}

export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

export interface Appointment {
  id: string;
  tenantId: string;
  patientId: string;
  practitionerId: string | null;
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

export interface Me {
  firstName: string;
  lastName: string;
  role: Role;
}

export interface TodayDashboard {
  appointments: Appointment[];
  // Omitted (null), not just empty, for recepcion — that role has no
  // access to clinical content at all.
  clinicalEntries: ClinicalEntry[] | null;
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
