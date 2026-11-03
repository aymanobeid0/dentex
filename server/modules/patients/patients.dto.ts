import type { ActorAccess } from '../../shared/actor';
import type { RegisterPatientInput } from './patients.schemas';

export interface PatientReceipt { id: string; fileNumber: string }
export interface Patient extends PatientReceipt {
  name: string; phone: string; gender: 'male' | 'female'; isChild: boolean;
  birthDate: string | null; address: string | null; administrativeNote: string | null;
}
export interface PatientsRepository {
  insert(clinicId: string, input: RegisterPatientInput): Promise<PatientReceipt>;
  find(clinicId: string, id: string): Promise<Patient | null>;
}
export interface PatientsScope { repository: PatientsRepository; actor: ActorAccess | null }
