export interface PlatformAccount {
  id: string;
  username: string;
  passwordHash: string;
  active: boolean;
  credentialVersion: number;
}

export interface PlatformSession {
  platformId: string;
  credentialVersion: number;
  identity: { kind: 'platform'; username: string };
}

export interface AuthRepository {
  findPlatformByUsername(username: string): Promise<PlatformAccount | null>;
  findPlatformById(id: string): Promise<PlatformAccount | null>;
  lockPlatform(id: string): Promise<void>;
}
import type { ClinicsOperations, Clinic } from '../clinics';
import type { EmployeesOperations } from '../employees';
import type { RolesOperations } from '../roles';

export interface ClinicSession {
  userId: string;
  clinicId: string;
  credentialVersion: number;
  identity: { kind: 'clinic'; username: string; name: string; clinic: Clinic; roles: string[]; permissions: string[] };
}
export interface ClinicAuthDependencies {
  clinics: Pick<ClinicsOperations, 'get' | 'byCode'>;
  employees: Pick<EmployeesOperations, 'credential' | 'loginCredential'>;
  roles: Pick<RolesOperations, 'assigned'>;
}
