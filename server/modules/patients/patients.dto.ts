import type { ActorAccess } from '../../shared/actor';
import type { ArchivePatientInput, EditPatientInput, ListPatientsInput, RegisterPatientInput } from './patients.schemas';

export interface PatientReceipt { id: string; fileNumber: string }
export interface Patient extends PatientReceipt {
  archived: boolean;
  editVersion: number;
  name: string; phone: string; gender: 'male' | 'female'; isChild: boolean;
  birthDate: string | null; address: string | null; administrativeNote: string | null;
}
export interface PatientsRepository {
  list(clinicId: string, input: ListPatientsInput): Promise<PatientList>;
  insert(clinicId: string, input: RegisterPatientInput): Promise<PatientReceipt>;
  find(clinicId: string, id: string): Promise<Patient | null>;
  replaceDetails(clinicId: string, id: string, input: EditPatientInput): Promise<PatientReceipt & { editVersion: number }>;
  setArchived(clinicId: string, id: string, input: ArchivePatientInput): Promise<PatientReceipt & { editVersion: number; archived: boolean }>;
}
export type PatientSummary = Pick<Patient, 'id' | 'fileNumber' | 'name' | 'phone' | 'isChild' | 'archived'>;
export interface PatientList { items: PatientSummary[]; page: number; hasNext: boolean }
export interface PatientsScope { repository: PatientsRepository; actor: ActorAccess | null }
