export interface Patient {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  documentId: string;
  dateOfBirth: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
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
