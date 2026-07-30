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

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
