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
