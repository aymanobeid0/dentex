import { Router } from 'express';
import type { createEmployeesController } from './employees.controller';
import { requireEmployeeManager } from '../../http/authorization';
export function employeesRouter(controller: ReturnType<typeof createEmployeesController>) {
  const router = Router();
  router.use(requireEmployeeManager);
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.post('/', controller.register);
  router.put('/:id', controller.edit);
  router.patch('/:id/status', controller.setStatus);
  router.post('/:id/reset-password', controller.resetPassword);
  return router;
}
