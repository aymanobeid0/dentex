import { Router, type RequestHandler } from 'express';
import { requireAdmin } from '../../http/authorization';
import { AuthorizationError } from '../../shared/errors';
import type { createPatientsController } from './patients.controller';
function requirePermission(permission: 'patients.read' | 'patients.write'): RequestHandler {
  return (_req, res, next) => {
    const identity = res.locals.identity;
    if (identity.kind !== 'clinic' || !(identity.roles.includes('admin') || identity.permissions.includes(permission))) throw new AuthorizationError();
    next();
  };
}
export function patientsRouter(controller: ReturnType<typeof createPatientsController>) {
  const router = Router();
  router.post('/', requirePermission('patients.write'), controller.register);
  router.get('/', requirePermission('patients.read'), controller.list);
  router.get('/numbering-history/:oldFileNumber', requireAdmin, controller.lookupOldNumber);
  router.get('/:id', requirePermission('patients.read'), controller.get);
  router.put('/:id', requirePermission('patients.write'), controller.edit);
  router.patch('/:id/archive', requirePermission('patients.write'), controller.archive);
  return router;
}
