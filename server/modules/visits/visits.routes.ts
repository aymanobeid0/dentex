import { Router, type RequestHandler } from "express";
import { AuthorizationError } from "../../shared/errors";
import type { createVisitsController } from "./visits.controller";
const requireAttendance: RequestHandler = (_req, res, next) => {
  const identity = res.locals.identity;
  if (
    identity.kind !== "clinic" ||
    !identity.roles.some((role: string) =>
      ["admin", "dentist", "receptionist"].includes(role),
    )
  )
    throw new AuthorizationError();
  next();
};
export function visitsRouter(
  controller: ReturnType<typeof createVisitsController>,
) {
  const router = Router();
  router.use(requireAttendance);
  router.get("/doctors", controller.doctors);
  router.get("/patients", controller.patients);
  router.get("/patient/:patientId", controller.history);
  router.all("/:id", (req, res, next) => {
    if (req.method === "DELETE") return controller.remove(req, res, next);
    next();
  });
  router.patch("/:id/correction", controller.correct);
  router.get("/:id/appointment-options", controller.appointmentOptions);
  router.patch("/:id/appointment-link", controller.appointmentLink);
  router.post("/:id/start", controller.start);
  router.post("/:id/complete", controller.complete);
  router.get("/", controller.list);
  router.get("/:id", controller.get);
  router.post("/", controller.arrive);
  router.patch("/:id", controller.edit);
  return router;
}
