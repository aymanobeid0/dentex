import type { AuthRepository, PlatformSession, ClinicSession, ClinicAuthDependencies } from './auth.dto';
import type { PlatformLoginInput, ClinicLoginInput } from './auth.schemas';
import { permissionKeys } from '../roles';
import { InvalidCredentialsError } from './auth.errors';
import { AuthenticationError } from '../../shared/errors';

export function createPlatformAuthService(repository: AuthRepository, verifyPassword: (password: string, hash: string) => Promise<boolean>) {
  return {
    async authorizePlatformMutation(id: string, version: number): Promise<boolean> {
      await repository.lockPlatform(id);
      const account = await repository.findPlatformById(id);
      return Boolean(account?.active && account.credentialVersion === version);
    },
    async loginPlatform(input: PlatformLoginInput): Promise<PlatformSession> {
      const account = await repository.findPlatformByUsername(input.username);
      if (!account?.active || !await verifyPassword(input.password, account.passwordHash)) throw new InvalidCredentialsError();
      return { platformId: account.id, credentialVersion: account.credentialVersion, identity: { kind: 'platform', username: account.username } };
    },
    async authenticatePlatform(id: string, version: number): Promise<PlatformSession> {
      const account = await repository.findPlatformById(id);
      if (!account?.active || account.credentialVersion !== version) throw new AuthenticationError();
      return { platformId: account.id, credentialVersion: account.credentialVersion, identity: { kind: 'platform', username: account.username } };
    },
  };
}

export function createAuthService(repository: AuthRepository, verifyPassword: (password: string, hash: string) => Promise<boolean>, dependencies: ClinicAuthDependencies) {
  async function clinicSession(id: string): Promise<(ClinicSession & { active: boolean }) | null> {
    const user = await dependencies.employees.credential(id);
    if (!user) return null;
    const clinic = await dependencies.clinics.get(user.clinicId);
    if (!clinic) return null;
    const assigned = await dependencies.roles.assigned(user.clinicId, id);
    return {
      userId: id, clinicId: user.clinicId, credentialVersion: user.credentialVersion, active: user.active,
      identity: { kind: 'clinic', username: user.username, name: user.name, clinic,
        roles: assigned.map(role => role.key).sort(),
        permissions: assigned.some(role => role.key === 'admin') ? [...permissionKeys] : [...new Set(assigned.flatMap(role => role.permissions))].sort(),
      },
    };
  }
  return {
    ...createPlatformAuthService(repository, verifyPassword),
    async loginClinic(input: ClinicLoginInput): Promise<ClinicSession> {
      const clinic = await dependencies.clinics.byCode(input.code);
      const user = clinic ? await dependencies.employees.loginCredential(clinic.id, input.username) : null;
      const dummyHash = `scrypt$32768$8$1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
      const passwordValid = await verifyPassword(input.password, user?.passwordHash ?? dummyHash);
      if (!user?.active || !passwordValid) throw new InvalidCredentialsError();
      const current = await clinicSession(user.id);
      if (!current?.active || current.credentialVersion !== user.credentialVersion) throw new InvalidCredentialsError();
      const { active: _active, ...session } = current;
      return session;
    },
    async authenticateClinic(id: string, version: number): Promise<ClinicSession> {
      const current = await clinicSession(id);
      if (!current?.active || current.credentialVersion !== version) throw new AuthenticationError();
      const { active: _active, ...session } = current;
      return session;
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
