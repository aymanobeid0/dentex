import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../server/database';
import { createTransactionManager } from '../server/infrastructure/transaction-manager';
import { createClinicsRepository } from '../server/modules/clinics/clinics.repository';
import { createClinicsService } from '../server/modules/clinics/clinics.service';
import type { ClinicsScope } from '../server/modules/clinics/clinics.dto';
import { createRolesRepository } from '../server/modules/roles/roles.repository';
import { createRolesOperations } from '../server/modules/roles/roles.service';
import { createEmployeesRepository } from '../server/modules/employees/employees.repository';
import { createEmployeesOperations } from '../server/modules/employees/employees.service';
import { createPatientsRepository } from '../server/modules/patients/patients.repository';
import { createPatientsOperations } from '../server/modules/patients/patients.service';
import type { ClinicMutation } from '../server/shared/actor';

describe.skipIf(!process.env.TEST_DATABASE_URL)('transaction infrastructure with an isolated database', () => {
  const database = createPrismaClient();
  beforeAll(() => {
    if (!process.env.TEST_DATABASE_URL || new URL(process.env.TEST_DATABASE_URL).pathname !== '/dentex_test' || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
      throw Error('Refusing fixtures outside dentex_test');
    }
  });
  afterAll(async () => { await database.$disconnect(); });

  it('rolls back writes made through two bound operation interfaces when a later step fails', async () => {
    const name = `transaction-${crypto.randomUUID()}`;
    const used = new Set((await database.clinic.findMany({ select: { code: true } })).map(clinic => clinic.code));
    const code = Array.from({ length: 10000 }, (_, i) => String(i).padStart(4, '0')).find(value => !used.has(value));
    if (!code) throw Error('No test code available');
    // Isolate the infrastructure contract; production operations are tested below.
    const manager = createTransactionManager(database, transaction => ({
      clinics: { register: () => transaction.clinic.create({ data: { name, code } }) },
      roles: { register: (clinicId: string) => transaction.role.create({ data: { clinicId, key: 'admin' } }) },
    }));
    let clinicId = '';
    let roleId = '';
    try {
      await expect(manager.run(async scope => {
        clinicId = (await scope.clinics.register()).id;
        roleId = (await scope.roles.register(clinicId)).id;
        throw Error('late failure');
      })).rejects.toThrow('late failure');
      expect(clinicId).not.toBe('');
      expect(roleId).not.toBe('');
      expect(await database.clinic.findUnique({ where: { id: clinicId } })).toBeNull();
      expect(await database.role.findUnique({ where: { id: roleId } })).toBeNull();
    } finally {
      if (roleId) await database.role.deleteMany({ where: { id: roleId } });
      if (clinicId) await database.clinic.deleteMany({ where: { id: clinicId, name } });
    }
  });

  it('rolls back the actual clinic, default roles, permissions and manager after a late module failure', async () => {
    const name = `modules-${crypto.randomUUID()}`;
    const used = new Set((await database.clinic.findMany({ select: { code: true } })).map(clinic => clinic.code));
    const code = Array.from({ length: 10000 }, (_, i) => String((i + 9000) % 10000).padStart(4, '0')).find(value => !used.has(value));
    if (!code) throw Error('No test code available');
    let clinicId = '';
    let roleIds: string[] = [];
    let userId = '';
    const manager = createTransactionManager<ClinicsScope, ClinicMutation>(database, transaction => {
      const repository = createClinicsRepository(transaction);
      const roles = createRolesOperations(createRolesRepository(transaction));
      const employees = createEmployeesOperations(createEmployeesRepository(transaction), roles);
      return {
        repository, roles, patients: createPatientsOperations(createPatientsRepository(transaction)), platformAuthorized: false,
        employees: {
          ...employees,
          async registerManager(input, adminRoleId) {
            await employees.registerManager(input, adminRoleId);
            clinicId = input.clinicId;
            roleIds = (await roles.list(clinicId)).map(role => role.id);
            userId = (await employees.administrators(clinicId))[0].id;
            expect(roleIds).toHaveLength(3);
            expect(await transaction.patientNumbering.findUnique({ where: { clinicId } })).toMatchObject({ start: 9007199254740993n, lastNumber: 9007199254740992n });
            expect((await roles.assigned(clinicId, userId))[0].key).toBe('admin');
            throw Error('failure after manager assignment');
          },
        },
      };
    });
    const roles = createRolesOperations(createRolesRepository(database));
    const service = createClinicsService(createClinicsRepository(database), createEmployeesOperations(createEmployeesRepository(database), roles), manager, async () => 'test-only-hash');
    try {
      await expect(service.register({ name, code, managerName: 'Manager', managerUsername: name, managerPassword: 'test-password', patientFileNumberStart: '9007199254740993' })).rejects.toThrow('failure after manager assignment');
      expect(userId).not.toBe('');
      expect(await database.clinic.findUnique({ where: { id: clinicId } })).toBeNull();
      expect(await database.user.findUnique({ where: { id: userId } })).toBeNull();
      expect(await database.patientNumbering.findUnique({ where: { clinicId } })).toBeNull();
      expect(await database.role.count({ where: { clinicId } })).toBe(0);
      expect(await database.userRole.count({ where: { clinicId } })).toBe(0);
      expect(await database.rolePermission.count({ where: { roleId: { in: roleIds } } })).toBe(0);
    } finally {
      if (clinicId) {
        await database.userRole.deleteMany({ where: { clinicId } });
        await database.user.deleteMany({ where: { clinicId } });
        await database.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
        await database.role.deleteMany({ where: { clinicId } });
        await database.clinic.deleteMany({ where: { id: clinicId, name } });
      }
    }
  });
});
