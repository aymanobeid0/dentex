import type { ClinicActor, ClinicMutation } from '../../shared/actor';
import type { TransactionManager } from '../../shared/transaction-manager';
import { AuthorizationError } from '../../shared/errors';
import type { RolesOperations } from '../roles';
import type { Employee, EmployeeRecord, EmployeesOperations, EmployeesRepository, EmployeesScope } from './employees.dto';
import type { CreateEmployeeInput, EditEmployeeInput, EmployeeStatusInput, ResetPasswordInput } from './employees.schemas';
import { EmployeesError } from './employees.errors';

async function expose(user: EmployeeRecord, roles: RolesOperations): Promise<Employee> {
  const assigned = await roles.assigned(user.clinicId, user.id);
  return { id: user.id, name: user.name, username: user.username, active: user.active, roles: assigned.map(({ id, key }) => ({ id, key })).sort((a, b) => a.key.localeCompare(b.key)) };
}

export function createEmployeesOperations(repository: EmployeesRepository, roles: RolesOperations): EmployeesOperations {
  return {
    async authorization(actor) {
      const user = await repository.findEmployee(actor.clinicId, actor.userId);
      if (!user) return null;
      const assigned = await roles.assigned(actor.clinicId, actor.userId);
      return { active: user.active, credentialVersion: user.credentialVersion, roles: assigned.map(role => role.key), permissions: [...new Set(assigned.flatMap(role => role.permissions))] };
    },
    credential: id => repository.findCredential(id),
    loginCredential: (clinicId, username) => repository.findLogin(clinicId, username),
    async registerManager(input, adminRoleId) {
      const [role] = await roles.selected(input.clinicId, [adminRoleId]);
      if (role?.key !== 'admin') throw new EmployeesError('invalid_roles');
      const user = await repository.insertEmployee(input);
      await roles.assign(input.clinicId, user.id, [adminRoleId]);
    },
    async administrators(clinicId) {
      const users = await repository.listEmployees(clinicId, await roles.administratorIds(clinicId));
      return users.map(({ id, name, username, active }) => ({ id, name, username, active }));
    },
    async resetAdministrator(clinicId, userId, passwordHash) {
      const user = await repository.findEmployee(clinicId, userId);
      if (!user || !(await roles.assigned(clinicId, userId)).some(role => role.key === 'admin')) throw new EmployeesError('not_found');
      await repository.resetPassword(userId, passwordHash);
    },
    changePassword: (clinicId, userId, version, passwordHash) => repository.compareAndSetPassword(clinicId, userId, version, passwordHash),
  };
}

export function createEmployeesService(repository: EmployeesRepository, roles: RolesOperations, transactions: TransactionManager<EmployeesScope, ClinicMutation>, hashPassword: (password: string) => Promise<string>) {
  async function locked<T>(actor: ClinicActor, action: (scope: EmployeesScope, actorIsAdmin: boolean) => Promise<T>): Promise<T> {
    return transactions.run(async scope => {
      const fresh = scope.actor;
      if (!fresh?.active || fresh.credentialVersion !== actor.credentialVersion || !(fresh.roles.includes('admin') || fresh.permissions.includes('employees.manage'))) throw new AuthorizationError();
      return action(scope, fresh.roles.includes('admin'));
    }, { clinicId: actor.clinicId, actor });
  }
  async function current(scope: EmployeesScope, clinicId: string, id: string, actorIsAdmin: boolean) {
    const user = await scope.repository.findEmployee(clinicId, id);
    if (!user) throw new EmployeesError('not_found');
    const isAdmin = (await scope.roles.assigned(clinicId, id)).some(role => role.key === 'admin');
    if (!actorIsAdmin && isAdmin) throw new AuthorizationError();
    return { user, isAdmin };
  }
  async function protectLastAdmin(scope: EmployeesScope, clinicId: string) {
    if (await scope.repository.countActive(clinicId, await scope.roles.administratorIds(clinicId)) <= 1) throw new EmployeesError('last_admin');
  }
  return {
    async list(clinicId: string) { return Promise.all((await repository.listEmployees(clinicId)).map(user => expose(user, roles))); },
    async get(clinicId: string, id: string) {
      const user = await repository.findEmployee(clinicId, id);
      if (!user) throw new EmployeesError('not_found');
      return expose(user, roles);
    },
    async register(actor: ClinicActor, input: CreateEmployeeInput) {
      const passwordHash = await hashPassword(input.password);
      return locked(actor, async (scope, isAdmin) => {
        const selected = await scope.roles.selected(actor.clinicId, input.roleIds);
        if (selected.length !== input.roleIds.length) throw new EmployeesError('invalid_roles');
        if (!isAdmin && selected.some(role => role.key === 'admin')) throw new AuthorizationError();
        const user = await scope.repository.insertEmployee({ clinicId: actor.clinicId, name: input.name, username: input.username, passwordHash });
        await scope.roles.assign(actor.clinicId, user.id, input.roleIds);
        return expose(user, scope.roles);
      });
    },
    edit(actor: ClinicActor, id: string, input: EditEmployeeInput) {
      return locked(actor, async (scope, isAdmin) => {
        // Match the original error ordering: missing target, invalid roles, then authorization.
        const user = await scope.repository.findEmployee(actor.clinicId, id);
        if (!user) throw new EmployeesError('not_found');
        const assigned = await scope.roles.assigned(actor.clinicId, id);
        const selected = await scope.roles.selected(actor.clinicId, input.roleIds);
        if (selected.length !== input.roleIds.length) throw new EmployeesError('invalid_roles');
        const wasAdmin = assigned.some(role => role.key === 'admin'), willBeAdmin = selected.some(role => role.key === 'admin');
        if (!isAdmin && (wasAdmin || willBeAdmin)) throw new AuthorizationError();
        if (user.active && wasAdmin && !willBeAdmin) await protectLastAdmin(scope, actor.clinicId);
        const updated = await scope.repository.editEmployee(id, { name: input.name, username: input.username });
        await scope.roles.assign(actor.clinicId, id, input.roleIds);
        return expose(updated, scope.roles);
      });
    },
    setStatus(actor: ClinicActor, id: string, input: EmployeeStatusInput) {
      return locked(actor, async (scope, isAdmin) => {
        const target = await current(scope, actor.clinicId, id, isAdmin);
        if (target.user.active && !input.active && target.isAdmin) await protectLastAdmin(scope, actor.clinicId);
        return expose(await scope.repository.setActive(id, input.active, target.user.active !== input.active), scope.roles);
      });
    },
    async resetPassword(actor: ClinicActor, id: string, input: ResetPasswordInput) {
      const passwordHash = await hashPassword(input.password);
      await locked(actor, async (scope, isAdmin) => {
        await current(scope, actor.clinicId, id, isAdmin);
        await scope.repository.resetPassword(id, passwordHash);
      });
    },
  };
}
export type EmployeesService = ReturnType<typeof createEmployeesService>;
