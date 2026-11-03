import { Router, type RequestHandler } from 'express';
import type { createAuthController } from './auth.controller';

export function authRouter(controller: ReturnType<typeof createAuthController>, loginLimit: RequestHandler) {
  const router = Router();
  router.post('/platform/login', loginLimit, controller.loginPlatform);
  router.post('/clinic/login', loginLimit, controller.loginClinic);
  router.post('/logout', controller.logout);
  return router;
}

export function sessionRouter(controller: ReturnType<typeof createAuthController>) {
  const router = Router();
  router.use(controller.authenticate);
  router.get('/auth/me', controller.me);
  return router;
}
