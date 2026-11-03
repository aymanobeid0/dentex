import type { RequestHandler, Response } from 'express';
import { AuthenticationError, AuthorizationError } from '../shared/errors';
import type { ClinicActor, PlatformActor } from '../shared/actor';

export const requirePlatform: RequestHandler = (_req, res, next) => {
  if (res.locals.identity.kind !== 'platform') throw new AuthenticationError();
  next();
};
export const requireClinic: RequestHandler = (_req, res, next) => {
  if (res.locals.identity.kind !== 'clinic') throw new AuthorizationError();
  next();
};
export const requireAdmin: RequestHandler = (_req, res, next) => {
  if (res.locals.identity.kind !== 'clinic' || !res.locals.identity.roles.includes('admin')) throw new AuthorizationError();
  next();
};
export const requireEmployeeManager: RequestHandler = (_req, res, next) => {
  const identity = res.locals.identity;
  if (identity.kind !== 'clinic' || !(identity.roles.includes('admin') || identity.permissions.includes('employees.manage'))) throw new AuthorizationError();
  next();
};
export const clinicActor = (res: Response): ClinicActor => ({ clinicId: res.locals.clinicId, userId: res.locals.userId, credentialVersion: res.locals.credentialVersion });
export const platformActor = (res: Response): PlatformActor => ({ platformId: res.locals.platformId, credentialVersion: res.locals.credentialVersion });
