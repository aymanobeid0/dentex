import { expect, it, vi } from 'vitest';
import { createAuthService } from '../server/modules/auth/auth.service';
import type { AuthRepository, ClinicAuthDependencies } from '../server/modules/auth/auth.dto';
import type { EmployeeRecord } from '../server/modules/employees';

const user: EmployeeRecord = { id: 'user', clinicId: 'clinic', name: 'Employee', username: 'employee', active: true, credentialVersion: 1, editVersion: 1, passwordHash: 'private-hash' };
const platform: AuthRepository = { findPlatformById: async () => null, findPlatformByUsername: async () => null, lockPlatform: async () => {} };
function dependencies(current: EmployeeRecord | null = user): ClinicAuthDependencies {
  const clinic = { id: 'clinic', name: 'Clinic', code: '0001' };
  return {
    clinics: { get: async () => clinic, byCode: async () => clinic },
    employees: { credential: async () => current, loginCredential: async () => user },
    roles: { assigned: async () => [{ id: 'role', key: 'dentist', permissions: ['patients.read'] }] },
  };
}
it.each([null, { ...user, active: false }, { ...user, credentialVersion: 2 }])('rejects a changed account after password verification', async current => {
  const service = createAuthService(platform, async () => true, dependencies(current));
  await expect(service.loginClinic({ code: '0001', username: 'employee', password: 'secret' })).rejects.toThrow('invalid_credentials');
});
it('performs dummy password verification for an unknown clinic without exposing existence', async () => {
  const verify = vi.fn(async () => false);
  const ports = dependencies();
  ports.clinics.byCode = async () => null;
  const service = createAuthService(platform, verify, ports);
  await expect(service.loginClinic({ code: '9999', username: 'employee', password: 'secret' })).rejects.toThrow('invalid_credentials');
  expect(verify).toHaveBeenCalledExactlyOnceWith('secret', `scrypt$32768$8$1$${'0'.repeat(32)}$${'0'.repeat(128)}`);
});
it('returns the unchanged clinic identity without credentials', async () => {
  const service = createAuthService(platform, async () => true, dependencies());
  const session = await service.loginClinic({ code: '0001', username: 'employee', password: 'secret' });
  expect(session.identity).toEqual({ kind: 'clinic', username: 'employee', name: 'Employee', clinic: { id: 'clinic', name: 'Clinic', code: '0001' }, roles: ['dentist'], permissions: ['patients.read'] });
  expect(JSON.stringify(session)).not.toMatch(/password|private-hash/);
});
