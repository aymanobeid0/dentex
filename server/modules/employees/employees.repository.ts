import { Prisma } from '../../../generated/prisma/client';
import type { EmployeesRepository } from './employees.dto';
import { EmployeesError } from './employees.errors';

async function unique<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new EmployeesError('duplicate_username');
    throw error;
  }
}
export function createEmployeesRepository(database: Prisma.TransactionClient): EmployeesRepository {
  const select = { id: true, clinicId: true, name: true, username: true, active: true, passwordHash: true, credentialVersion: true } as const;
  return {
    listEmployees: (clinicId, ids) => database.user.findMany({ where: { clinicId, ...(ids ? { id: { in: ids } } : {}) }, select, orderBy: { name: 'asc' } }),
    findEmployee: (clinicId, id) => database.user.findFirst({ where: { clinicId, id }, select }),
    findCredential: id => database.user.findUnique({ where: { id }, select }),
    findLogin: (clinicId, username) => database.user.findUnique({ where: { clinicId_username: { clinicId, username } }, select }),
    insertEmployee: input => unique(() => database.user.create({ data: input, select })),
    editEmployee: (id, input) => unique(() => database.user.update({ where: { id }, data: input, select })),
    setActive: (id, active, changed) => database.user.update({ where: { id }, data: changed ? { active, credentialVersion: { increment: 1 } } : {}, select }),
    async resetPassword(id, passwordHash) { await database.user.update({ where: { id }, data: { passwordHash, credentialVersion: { increment: 1 } } }); },
    async compareAndSetPassword(clinicId, id, version, passwordHash) {
      const changed = await database.user.updateMany({ where: { clinicId, id, active: true, credentialVersion: version }, data: { passwordHash, credentialVersion: { increment: 1 } } });
      return changed.count === 1;
    },
    countActive: (clinicId, ids) => database.user.count({ where: { clinicId, id: { in: ids }, active: true } }),
  };
}
