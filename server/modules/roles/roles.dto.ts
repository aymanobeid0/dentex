import type { ActorAccess } from '../../shared/actor';
export interface Role { id: string; key: string }
export interface RolePermissions extends Role { permissions: string[] }
export interface RoleAssignment { userId: string; role: RolePermissions }
export interface RolesRepository {
  listRoles(clinicId: string): Promise<RolePermissions[]>;
  findRoles(clinicId: string, ids: string[]): Promise<Role[]>;
  insertDefaults(clinicId: string, defaults: Record<string, string[]>, keys: readonly string[]): Promise<Role[]>;
  listAssignments(clinicId: string, userIds?: string[]): Promise<RoleAssignment[]>;
  replaceAssignments(clinicId: string, userId: string, roleIds: string[]): Promise<void>;
  replacePermissions(roleId: string, keys: string[], allKeys: readonly string[]): Promise<void>;
}
export interface RolesOperations {
  list(clinicId: string): Promise<RolePermissions[]>;
  selected(clinicId: string, ids: string[]): Promise<Role[]>;
  assigned(clinicId: string, userId: string): Promise<RolePermissions[]>;
  administratorIds(clinicId: string): Promise<string[]>;
  assign(clinicId: string, userId: string, roleIds: string[]): Promise<void>;
  initialize(clinicId: string): Promise<Role[]>;
}
export interface RolesScope { repository: RolesRepository; actor: ActorAccess | null }
