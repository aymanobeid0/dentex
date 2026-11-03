import type { ClinicActor } from '../../shared/actor';
export interface AccountCredential { passwordHash: string; credentialVersion: number; active: boolean; clinicId: string }
export interface AccountRepository {
  credential(actor: ClinicActor): Promise<AccountCredential | null>;
  replacePassword(actor: ClinicActor, passwordHash: string): Promise<boolean>;
}
