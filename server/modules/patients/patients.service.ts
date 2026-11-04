import type { ClinicActor, ClinicMutation } from '../../shared/actor';
import { AuthorizationError } from '../../shared/errors';
import type { TransactionManager } from '../../shared/transaction-manager';
import type { PatientsRepository, PatientsScope } from './patients.dto';
import type { ListPatientsInput, RegisterPatientInput } from './patients.schemas';
import { PatientsError } from './patients.errors';

export function createPatientsService(repository: PatientsRepository, transactions: TransactionManager<PatientsScope, ClinicMutation>) {
  return {
    list(clinicId: string, input: ListPatientsInput) {
      return repository.list(clinicId, input);
    },
    register(actor: ClinicActor, input: RegisterPatientInput) {
      return transactions.run(async scope => {
        const fresh = scope.actor;
        if (!fresh?.active || fresh.credentialVersion !== actor.credentialVersion || !(fresh.roles.includes('admin') || fresh.permissions.includes('patients.write'))) throw new AuthorizationError();
        return scope.repository.insert(actor.clinicId, input);
      }, { clinicId: actor.clinicId, actor });
    },
    async get(clinicId: string, id: string) {
      const patient = await repository.find(clinicId, id);
      if (!patient) throw new PatientsError('not_found');
      return patient;
    },
  };
}
export type PatientsService = ReturnType<typeof createPatientsService>;
