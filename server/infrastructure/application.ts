import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { hashPassword, verifyPassword } from '../password';
import type { ActorAccess, ClinicMutation } from '../shared/actor';
import { createTransactionManager } from './transaction-manager';
import { createAuthRepository } from '../modules/auth/auth.repository';
import { createAuthService, createPlatformAuthService } from '../modules/auth/auth.service';
import { createRolesRepository } from '../modules/roles/roles.repository';
import { createRolesOperations, createRolesService } from '../modules/roles/roles.service';
import type { RolesScope } from '../modules/roles/roles.dto';
import { createEmployeesRepository } from '../modules/employees/employees.repository';
import { createEmployeesOperations, createEmployeesService } from '../modules/employees/employees.service';
import type { EmployeesScope } from '../modules/employees/employees.dto';
import { createClinicsRepository } from '../modules/clinics/clinics.repository';
import { createClinicsOperations, createClinicsService } from '../modules/clinics/clinics.service';
import type { ClinicsScope } from '../modules/clinics/clinics.dto';
import { createAccountRepository } from '../modules/account/account.repository';
import { createAccountService } from '../modules/account/account.service';
import { createPatientsRepository } from '../modules/patients/patients.repository';
import { createPatientsOperations, createPatientsService } from '../modules/patients/patients.service';
import type { PatientsScope } from '../modules/patients/patients.dto';
import { createAppointmentsRepository } from '../modules/appointments/appointments.repository';
import { createAppointmentsService } from '../modules/appointments/appointments.service';
import type { AppointmentsScope } from '../modules/appointments/appointments.dto';

/** The only place that assembles feature internals; no business decisions here. */
export function createServices(database: PrismaClient) {
  function bind(client: Prisma.TransactionClient) {
    const rolesRepository = createRolesRepository(client);
    const roles = createRolesOperations(rolesRepository);
    const employeesRepository = createEmployeesRepository(client);
    const employees = createEmployeesOperations(employeesRepository, roles);
    const clinicsRepository = createClinicsRepository(client);
    const clinics = createClinicsOperations(clinicsRepository);
    const authRepository = createAuthRepository(client);
    const platform = createPlatformAuthService(authRepository, verifyPassword);
    return { rolesRepository, roles, employeesRepository, employees, clinicsRepository, clinics, authRepository, platform };
  }
  async function mutation(client: Prisma.TransactionClient, context?: ClinicMutation) {
    const bound = bind(client);
    let actor: ActorAccess | null = null;
    let platformAuthorized = false;
    if (context) {
      // The requesting service chooses the mutation context. All snapshots and
      // subsequent public operations share this lock and this transaction.
      await bound.clinics.lockForMutation(context.clinicId);
      if (context.actor) actor = await bound.employees.authorization(context.actor);
      if (context.platformActor) platformAuthorized = await bound.platform.authorizePlatformMutation(context.platformActor.platformId, context.platformActor.credentialVersion);
    }
    return { ...bound, actor, platformAuthorized };
  }
  const bound = bind(database);
  const appointmentsTransactions = createTransactionManager<AppointmentsScope, ClinicMutation>(database, async (client, context) => {
    const scope = await mutation(client, context);
    return { repository: createAppointmentsRepository(client), patients: createPatientsOperations(createPatientsRepository(client)), employees: scope.employees, actor: scope.actor };
  });
  const patientsTransactions = createTransactionManager<PatientsScope, ClinicMutation>(database, async (client, context) => {
    const scope = await mutation(client, context);
    return { repository: createPatientsRepository(client), actor: scope.actor };
  });
  const rolesTransactions = createTransactionManager<RolesScope, ClinicMutation>(database, async (client, context) => {
    const scope = await mutation(client, context);
    return { repository: scope.rolesRepository, actor: scope.actor };
  });
  const employeesTransactions = createTransactionManager<EmployeesScope, ClinicMutation>(database, async (client, context) => {
    const scope = await mutation(client, context);
    return { repository: scope.employeesRepository, roles: scope.roles, actor: scope.actor };
  });
  const clinicsTransactions = createTransactionManager<ClinicsScope, ClinicMutation>(database, async (client, context) => {
    const scope = await mutation(client, context);
    return { repository: scope.clinicsRepository, roles: scope.roles, employees: scope.employees, patients: createPatientsOperations(createPatientsRepository(client)), platformAuthorized: scope.platformAuthorized };
  });
  return {
    appointments: createAppointmentsService(appointmentsTransactions),
    auth: createAuthService(bound.authRepository, verifyPassword, bound),
    patients: createPatientsService(createPatientsRepository(database), patientsTransactions),
    roles: createRolesService(bound.rolesRepository, rolesTransactions),
    clinics: createClinicsService(bound.clinicsRepository, bound.employees, clinicsTransactions, hashPassword),
    employees: createEmployeesService(bound.employeesRepository, bound.roles, employeesTransactions, hashPassword),
    account: createAccountService(createAccountRepository(bound.employees), hashPassword, verifyPassword),
  };
}
