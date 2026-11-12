import type { ClinicActor, ClinicMutation } from '../../shared/actor';
import { AuthorizationError } from '../../shared/errors';
import type { TransactionManager } from '../../shared/transaction-manager';
import type { PatientsOperations, PatientsRepository, PatientsScope } from './patients.dto';
import type { ArchivePatientInput, EditPatientInput, ListPatientsInput, RegisterPatientInput } from './patients.schemas';
import { PatientsError } from './patients.errors';

export function createPatientsOperations(repository: PatientsRepository): PatientsOperations {
  return {
    initializeNumbering: (clinicId, start) => repository.initializeNumbering(clinicId, start),
    appointmentReference: (clinicId, id) => repository.appointmentReference(clinicId, id),
  };
}
export function createPatientsService(repository: PatientsRepository, transactions: TransactionManager<PatientsScope, ClinicMutation>) {
  return {
    lookupOldNumber(actor: ClinicActor, oldFileNumber: string) {
      return transactions.run(async scope => {
        const fresh = scope.actor;
        if (!fresh?.active || fresh.credentialVersion !== actor.credentialVersion || !fresh.roles.includes('admin')) throw new AuthorizationError();
        const patient = await scope.repository.findOldNumber(actor.clinicId, oldFileNumber);
        if (!patient) throw new PatientsError('not_found');
        return patient;
      }, { clinicId: actor.clinicId, actor });
    },
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
    edit(actor: ClinicActor, id: string, input: EditPatientInput) {
      return transactions.run(async scope => {
        const fresh = scope.actor;
        if (!fresh?.active || fresh.credentialVersion !== actor.credentialVersion || !(fresh.roles.includes('admin') || fresh.permissions.includes('patients.write'))) throw new AuthorizationError();
        const patient = await scope.repository.find(actor.clinicId, id);
        if (!patient) throw new PatientsError('not_found');
        if (patient.archived) throw new PatientsError('patient_archived');
        if (patient.editVersion !== input.editVersion) throw new PatientsError('edit_conflict');
        return scope.repository.replaceDetails(actor.clinicId, id, input);
      }, { clinicId: actor.clinicId, actor });
    },
    archive(actor: ClinicActor, id: string, input: ArchivePatientInput) {
      return transactions.run(async scope => {
        const fresh = scope.actor;
        if (!fresh?.active || fresh.credentialVersion !== actor.credentialVersion || !(fresh.roles.includes('admin') || fresh.permissions.includes('patients.write'))) throw new AuthorizationError();
        const patient = await scope.repository.find(actor.clinicId, id);
        if (!patient) throw new PatientsError('not_found');
        if (patient.editVersion !== input.editVersion) throw new PatientsError('edit_conflict');
        return scope.repository.setArchived(actor.clinicId, id, input);
      }, { clinicId: actor.clinicId, actor });
    },
  };
}
export type PatientsService = ReturnType<typeof createPatientsService>;
