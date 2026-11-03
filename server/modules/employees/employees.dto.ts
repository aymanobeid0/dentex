import type { Role, RolesOperations } from '../roles';
import type { ActorAccess, ClinicActor } from '../../shared/actor';
export interface EmployeeRecord { id: string; clinicId: string; name: string; username: string; active: boolean; passwordHash: string; credentialVersion: number }
export interface Employee { id: string; name: string; username: string; active: boolean; roles: Role[] }
export interface NewEmployee { clinicId: string; name: string; username: string; passwordHash: string }
export interface EmployeesRepository {
  listEmployees(clinicId: string, ids?: string[]): Promise<EmployeeRecord[]>;
  findEmployee(clinicId: string, id: string): Promise<EmployeeRecord | null>;
  findCredential(id: string): Promise<EmployeeRecord | null>;
  findLogin(clinicId: string, username: string): Promise<EmployeeRecord | null>;
  insertEmployee(input: NewEmployee): Promise<EmployeeRecord>;
  editEmployee(id: string, input: { name: string; username: string }): Promise<EmployeeRecord>;
  setActive(id: string, active: boolean, changed: boolean): Promise<EmployeeRecord>;
  resetPassword(id: string, passwordHash: string): Promise<void>;
  compareAndSetPassword(clinicId: string, id: string, version: number, passwordHash: string): Promise<boolean>;
  countActive(clinicId: string, ids: string[]): Promise<number>;
}
/** Used by auth/account and by clinic workflows bound to the current transaction. */
export interface EmployeesOperations {
  authorization(actor: ClinicActor): Promise<ActorAccess | null>;
  credential(id: string): Promise<EmployeeRecord | null>;
  loginCredential(clinicId: string, username: string): Promise<EmployeeRecord | null>;
  registerManager(input: NewEmployee, adminRoleId: string): Promise<void>;
  administrators(clinicId: string): Promise<Array<{ id: string; name: string; username: string; active: boolean }>>;
  resetAdministrator(clinicId: string, userId: string, passwordHash: string): Promise<void>;
  changePassword(clinicId: string, userId: string, version: number, passwordHash: string): Promise<boolean>;
}
export interface EmployeesScope { repository: EmployeesRepository; roles: RolesOperations; actor: ActorAccess | null }
