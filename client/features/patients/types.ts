export type Patient = {
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
