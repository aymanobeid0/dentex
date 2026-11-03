import type { EmployeesOperations } from '../employees';
import type { AccountRepository } from './account.dto';
/** Account owns no table; employee storage is reached through its public operations. */
export function createAccountRepository(employees: EmployeesOperations): AccountRepository {
  return {
    async credential(actor) {
      const user = await employees.credential(actor.userId);
      if (!user) return null;
      return { passwordHash: user.passwordHash, credentialVersion: user.credentialVersion, active: user.active, clinicId: user.clinicId };
    },
    replacePassword: (actor, passwordHash) => employees.changePassword(actor.clinicId, actor.userId, actor.credentialVersion, passwordHash),
  };
}
