import { Router } from "express";
import { AuthorizationError } from "../../shared/errors";
import type { createTreatmentsController } from "./treatments.controller";
export function treatmentsRouter(
  controller: ReturnType<typeof createTreatmentsController>,
) {
  const router = Router();
  // A separate router handles only clinical paths; administrative routes keep their policy.
  router.use(
    [
      "/patient/:patientId/treatment-plans",
      "/treatment-plans/:planId",
      "/treatment-items/:itemId",
    ],
    (_req, res, next) => {
      const identity = res.locals.identity;
      if (
        identity.kind !== "clinic" ||
        !identity.roles.some((role: string) =>
          ["admin", "dentist"].includes(role),
        )
      )
        throw new AuthorizationError();
      next();
    },
  );
  router.get("/patient/:patientId/treatment-plans", controller.list);
  router.post("/patient/:patientId/treatment-plans", controller.create);
  router.patch("/treatment-plans/:planId", controller.edit);
  router.post("/treatment-plans/:planId/items", controller.addItem);
  router.patch("/treatment-items/:itemId", controller.editItem);
  return router;
}
