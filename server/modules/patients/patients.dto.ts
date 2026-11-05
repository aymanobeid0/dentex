import type { ActorAccess } from '../../shared/actor';
import type { EditPatientInput, ListPatientsInput, RegisterPatientInput } from './patients.schemas';

export interface PatientReceipt { id: string; fileNumber: string }
export interface Patient extends PatientReceipt {
  editVersion: number;
  name: string; phone: string; gender: 'male' | 'female'; isChild: boolean;
  birthDate: string | null; address: string | null; administrativeNote: string | null;
}
export interface PatientsRepository {
  list(clinicId: string, input: ListPatientsInput): Promise<PatientList>;
  insert(clinicId: string, input: RegisterPatientInput): Promise<PatientReceipt>;
  find(clinicId: string, id: string): Promise<Patient | null>;
  replaceDetails(clinicId: string, id: string, input: EditPatientInput): Promise<PatientReceipt & { editVersion: number }>;
}
export type PatientSummary = Pick<Patient, 'id' | 'fileNumber' | 'name' | 'phone' | 'isChild'>;
export interface PatientList { items: PatientSummary[]; page: number; hasNext: boolean }
export interface PatientsScope { repository: PatientsRepository; actor: ActorAccess | null }
