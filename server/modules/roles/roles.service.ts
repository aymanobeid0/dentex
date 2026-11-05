import type { ClinicActor, ClinicMutation } from '../../shared/actor';
import type { TransactionManager } from '../../shared/transaction-manager';
import { AuthorizationError } from '../../shared/errors';
import type { RolesOperations, RolesRepository, RolesScope } from './roles.dto';
import { permissionKeys, type PermissionsInput } from './roles.schemas';
import { RolesError } from './roles.errors';

const defaults = {
  dentist: ['patients.read','patients.write','patient_records.read','patient_records.write','dental_chart.read','dental_chart.write','appointments.read','appointments.write','prescriptions.read','prescriptions.write','invoices.read','payments.read','patient_financial.read'],
  receptionist: ['patients.read','patients.write','communications.read','communications.write','appointments.read','appointments.write','invoices.read','invoices.write','payments.read','payments.write','patient_financial.read'],
};

export function createRolesOperations(repository: RolesRepository): RolesOperations {
  return {
    list: clinicId => repository.listRoles(clinicId),
    selected: (clinicId, ids) => repository.findRoles(clinicId, ids),
    async assigned(clinicId, userId) { return (await repository.listAssignments(clinicId, [userId])).map(row => row.role); },
    async administratorIds(clinicId) { return [...new Set((await repository.listAssignments(clinicId)).filter(row => row.role.key === 'admin').map(row => row.userId))]; },
    async assign(clinicId, userId, roleIds) {
      if ((await repository.findRoles(clinicId, roleIds)).length !== roleIds.length) throw new RolesError('invalid_roles');
      await repository.replaceAssignments(clinicId, userId, roleIds);
    },
    initialize: clinicId => repository.insertDefaults(clinicId, defaults, permissionKeys),
  };
}

export function createRolesService(repository: RolesRepository, transactions: TransactionManager<RolesScope, ClinicMutation>) {
  return {
    async list(clinicId: string) {
      return transactions.run(async scope => {
        const roles = await scope.repository.listRoles(clinicId);
        return { permissions: permissionKeys, roles: roles.map(role => ({ ...role, permissions: role.key === 'admin' ? [...permissionKeys] : role.permissions.filter(key => permissionKeys.includes(key as typeof permissionKeys[number])).sort() })) };
      }, {clinicId});
    },
    async choices(clinicId: string) { return (await repository.listRoles(clinicId)).map(({ id, key }) => ({ id, key })); },
    change(actor: ClinicActor, id: string, input: PermissionsInput) {
      return transactions.run(async scope => {
        if (!scope.actor?.active || scope.actor.credentialVersion !== actor.credentialVersion || !scope.actor.roles.includes('admin')) throw new AuthorizationError();
        const [role] = await scope.repository.findRoles(actor.clinicId, [id]);
        if (!role) throw new RolesError('not_found');
        if (role.key === 'admin') throw new RolesError('admin_locked');
        await scope.repository.replacePermissions(actor.clinicId, id, input.editVersion, input.permissions, permissionKeys);
        return { ...role, editVersion: input.editVersion + 1, permissions: [...input.permissions].sort() };
      }, { clinicId: actor.clinicId, actor });
    },
  };
}
export type RolesService = ReturnType<typeof createRolesService>;
