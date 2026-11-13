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
const requireRead: RequestHandler = (_req, res, next) => {
  const identity = res.locals.identity;
  if (
    identity.kind !== "clinic" ||
    !(
      identity.roles.includes("admin") ||
      identity.permissions.includes("appointments.read")
    )
  )
    throw new AuthorizationError();
  next();
};
const requireDoctorReference: RequestHandler = (_req, res, next) => {
  const identity = res.locals.identity;
  if (
    identity.kind !== "clinic" ||
    !(
      identity.roles.includes("admin") ||
      identity.permissions.some((key: string) =>
        ["appointments.read", "appointments.write"].includes(key),
      )
    )
  )
    throw new AuthorizationError();
  next();
};
export function appointmentsRouter(
  controller: ReturnType<typeof createAppointmentsController>,
) {
  const router = Router();
  router.get("/doctors", requireDoctorReference, controller.doctors);
  router.get("/patients", requireWrite, controller.patients);
  router.get("/patient/:patientId", requireRead, controller.patient);
  router.get("/", requireRead, controller.list);
  router.get("/:id", requireRead, controller.get);
  router.post("/", requireWrite, controller.book);
  router.patch("/:id", requireRead, requireWrite, controller.edit);
  return router;
}
