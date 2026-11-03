import { Router } from 'express';
import type { createAccountController } from './account.controller';
import { requireClinic } from '../../http/authorization';
export function accountRouter(controller: ReturnType<typeof createAccountController>) {
  const router = Router();
  router.post('/password', requireClinic, controller.changePassword);
  return router;
}
