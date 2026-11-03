export interface ClinicActor { clinicId: string; userId: string; credentialVersion: number }
export interface PlatformActor { platformId: string; credentialVersion: number }
/** Fresh authorization facts loaded after the clinic lock, in the same transaction. */
export interface ActorAccess { active: boolean; credentialVersion: number; roles: string[]; permissions: string[] }
export interface ClinicMutation { clinicId: string; actor?: ClinicActor; platformActor?: PlatformActor }
