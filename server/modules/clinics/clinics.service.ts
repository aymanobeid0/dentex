import type { ClinicMutation, PlatformActor } from '../../shared/actor';
import type { TransactionManager } from '../../shared/transaction-manager';
import { ApplicationError, AuthenticationError } from '../../shared/errors';
import type { EmployeesOperations } from '../employees';
import type { ClinicsOperations, ClinicsRepository, ClinicsScope } from './clinics.dto';
import type { CreateClinicInput, ResetAdministratorInput } from './clinics.schemas';
import { ClinicsError } from './clinics.errors';

export function createClinicsOperations(repository: ClinicsRepository): ClinicsOperations {
  return { get: id => repository.findClinic(id), byCode: code => repository.findCode(code), lockForMutation: id => repository.lockClinic(id) };
}
export function createClinicsService(repository: ClinicsRepository, employees: EmployeesOperations, transactions: TransactionManager<ClinicsScope, ClinicMutation>, hashPassword: (password: string) => Promise<string>) {
  return {
    list: () => repository.listClinics(),
    async administrators(clinicId: string) {
      if (!await repository.findClinic(clinicId)) throw new ClinicsError('not_found');
      return employees.administrators(clinicId);
    },
    async register(input: CreateClinicInput) {
      const passwordHash = await hashPassword(input.managerPassword);
      try {
        return await transactions.run(async scope => {
          const clinic = await scope.repository.insertClinic({ name: input.name, code: input.code });
          await scope.patients.initializeNumbering(clinic.id, '1');
          const roles = await scope.roles.initialize(clinic.id);
          const admin = roles.find(role => role.key === 'admin');
          if (!admin) throw Error('Missing initial administrator role');
          await scope.employees.registerManager({ clinicId: clinic.id, name: input.managerName, username: input.managerUsername, passwordHash }, admin.id);
          return clinic;
        });
      } catch (error) {
        if (error instanceof ApplicationError && error.code === 'duplicate_username') throw new ClinicsError('duplicate_code');
        throw error;
      }
    },
    async resetAdministrator(actor: PlatformActor, clinicId: string, userId: string, input: ResetAdministratorInput) {
      const passwordHash = await hashPassword(input.password);
      await transactions.run(async scope => {
        if (!scope.platformAuthorized) throw new AuthenticationError();
        await scope.employees.resetAdministrator(clinicId, userId, passwordHash);
      }, { clinicId, platformActor: actor });
    },
  };
}
export type ClinicsService = ReturnType<typeof createClinicsService>;
