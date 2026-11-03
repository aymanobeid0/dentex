import type { ClinicActor } from '../../shared/actor';
import { AuthenticationError } from '../../shared/errors';
import type { AccountRepository } from './account.dto';
import type { ChangePasswordInput } from './account.schemas';
import { IncorrectPasswordError } from './account.errors';
export function createAccountService(repository: AccountRepository, hashPassword: (password: string) => Promise<string>, verifyPassword: (password: string, hash: string) => Promise<boolean>) {
  return {
    async changePassword(actor: ClinicActor, input: ChangePasswordInput) {
      const credential = await repository.credential(actor);
      if (!credential?.active || credential.clinicId !== actor.clinicId || credential.credentialVersion !== actor.credentialVersion) throw new AuthenticationError();
      if (!await verifyPassword(input.currentPassword, credential.passwordHash)) throw new IncorrectPasswordError();
      const passwordHash = await hashPassword(input.newPassword);
      if (!await repository.replacePassword(actor, passwordHash)) throw new AuthenticationError();
    },
  };
}
export type AccountService = ReturnType<typeof createAccountService>;
