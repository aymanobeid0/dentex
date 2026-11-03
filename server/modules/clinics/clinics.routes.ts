import { Router } from 'express';
import type { createClinicsController } from './clinics.controller';
import { requirePlatform } from '../../http/authorization';
export function clinicsRouter(controller: ReturnType<typeof createClinicsController>) {
  const router = Router();
  router.use(requirePlatform);
  router.get('/', controller.list);
  router.post('/', controller.register);
  router.get('/:clinicId/admins', controller.administrators);
  router.post('/:clinicId/admins/:userId/reset-password', controller.resetAdministrator);
  return router;
}
