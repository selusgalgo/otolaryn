export interface Patient {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  documentId: string | null;
  dateOfBirth: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  profession: string | null;
  legacyId: string | null;
  insuranceEntityId: string | null;
  firstConsultationDate: string | null;
  assignedPractitionerId: string | null;
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

export interface AntecedenteType {
  id: string;
  tenantId: string;
  name: string;
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
