import { Router, type RequestHandler } from "express";
import { AuthorizationError } from "../../shared/errors";
import type { createAppointmentsController } from "./appointments.controller";
const requireWrite: RequestHandler = (_req, res, next) => {
  const identity = res.locals.identity;
  if (
    identity.kind !== "clinic" ||
    !(
      identity.roles.includes("admin") ||
      identity.permissions.includes("appointments.write")
    )
  )
    throw new AuthorizationError();
  next();
};
export function appointmentsRouter(
  controller: ReturnType<typeof createAppointmentsController>,
) {
  const router = Router();
  router.get("/doctors", requireWrite, controller.doctors);
  router.post("/", requireWrite, controller.book);
  return router;
}
