import type { EmployeesOperations } from '../employees';
import type { RolesOperations } from '../roles';
export interface Clinic { id: string; name: string; code: string }
export interface ClinicsRepository {
  listClinics(): Promise<Clinic[]>;
  findClinic(id: string): Promise<Clinic | null>;
  findCode(code: string): Promise<Clinic | null>;
  insertClinic(input: { name: string; code: string }): Promise<Clinic>;
  lockClinic(id: string): Promise<void>;
}
export interface ClinicsOperations {
  get(id: string): Promise<Clinic | null>;
  byCode(code: string): Promise<Clinic | null>;
  lockForMutation(id: string): Promise<void>;
}
export interface ClinicsScope {
  repository: ClinicsRepository;
  roles: RolesOperations;
  employees: EmployeesOperations;
  platformAuthorized: boolean;
}
