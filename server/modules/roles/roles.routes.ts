import { Router } from 'express';
import type { createRolesController } from './roles.controller';
import { requireAdmin, requireEmployeeManager } from '../../http/authorization';
export function rolesRouter(controller: ReturnType<typeof createRolesController>) {
  const router = Router();
  router.get('/roles', requireEmployeeManager, controller.choices);
  router.get('/role-permissions', requireAdmin, controller.list);
  router.put('/role-permissions/:id', requireAdmin, controller.change);
  return router;
}
