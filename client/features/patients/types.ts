export type PatientView =
  { kind: "list" } | { kind: "new" } | { kind: "file"; patientId: string };

export type Patient = {
  archived: boolean;
  editVersion: number;
  id: string;
  fileNumber: string;
  name: string;
  phone: string;
  gender: string;
  isChild: boolean;
  birthDate: string | null;
  address: string | null;
  administrativeNote: string | null;
};
export type PatientSummary = {
  archived: boolean;
  id: string;
  name: string;
  fileNumber: string;
  phone: string;
  isChild: boolean;
};
export type PatientSearchResult = {
  items: PatientSummary[];
  page: number;
  hasNext: boolean;
};
