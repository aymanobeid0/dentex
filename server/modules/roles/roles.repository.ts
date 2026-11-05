import type { Prisma } from '../../../generated/prisma/client';
import { RolesError } from './roles.errors';
import type { RolesRepository } from './roles.dto';

export function createRolesRepository(database: Prisma.TransactionClient): RolesRepository {
  return {
    async listRoles(clinicId) {
      const roles = await database.role.findMany({ where: { clinicId }, include: { permissions: true }, orderBy: { key: 'asc' } });
      return roles.map(role => ({ id: role.id, key: role.key, editVersion: role.editVersion, permissions: role.permissions.map(p => p.permissionKey) }));
    },
    findRoles: (clinicId, ids) => database.role.findMany({ where: { clinicId, id: { in: ids } }, select: { id: true, key: true } }),
    async insertDefaults(clinicId, defaults, keys) {
      await database.role.createMany({ data: ['admin', 'dentist', 'receptionist'].map(key => ({ clinicId, key })) });
      const roles = await database.role.findMany({ where: { clinicId }, select: { id: true, key: true } });
      await database.permission.createMany({ data: keys.map(key => ({ key })), skipDuplicates: true });
      await database.rolePermission.createMany({ data: roles.flatMap(role => (defaults[role.key] ?? []).map(permissionKey => ({ roleId: role.id, permissionKey }))), skipDuplicates: true });
      return roles;
    },
    async listAssignments(clinicId, userIds) {
      const rows = await database.userRole.findMany({ where: { clinicId, ...(userIds ? { userId: { in: userIds } } : {}) }, include: { role: { include: { permissions: true } } } });
      return rows.map(row => ({ userId: row.userId, role: { id: row.role.id, key: row.role.key, editVersion: row.role.editVersion, permissions: row.role.permissions.map(p => p.permissionKey) } }));
    },
    async replaceAssignments(clinicId, userId, roleIds) {
      await database.userRole.deleteMany({ where: { clinicId, userId } });
      await database.userRole.createMany({ data: roleIds.map(roleId => ({ clinicId, userId, roleId })) });
    },
    async replacePermissions(clinicId, roleId, editVersion, keys, allKeys) {
      const result=await database.role.updateMany({where:{clinicId,id:roleId,editVersion},data:{editVersion:{increment:1}}});
      if(result.count !== 1) throw new RolesError('edit_conflict');
      await database.permission.createMany({ data: allKeys.map(key => ({ key })), skipDuplicates: true });
      await database.rolePermission.deleteMany({ where: { roleId } });
      await database.rolePermission.createMany({ data: keys.map(permissionKey => ({ roleId, permissionKey })) });
    },
  };
}
