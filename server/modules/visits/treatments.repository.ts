import { Prisma } from "../../../generated/prisma/client";
import type {
  TreatmentsRepository,
  TreatmentPlan,
  TreatmentItem,
} from "./treatments.dto";
import { ApplicationError } from "../../shared/errors";

export function createTreatmentsRepository(
  db: Prisma.TransactionClient,
): TreatmentsRepository {
  const include = {
    items: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
    history: {
      orderBy: [{ recordedAt: "asc" as const }, { id: "asc" as const }],
    },
  };
  const exposeItem = (
    row: Prisma.TreatmentItemGetPayload<{ include: { plan: true } }>,
  ): TreatmentItem => ({
    id: row.id,
    planId: row.planId,
    patientId: row.plan.patientId,
    description: row.description,
    location: row.location,
    notes: row.notes,
    status: row.status as TreatmentItem["status"],
    editVersion: row.editVersion,
  });
  const expose = (
    row: Prisma.TreatmentPlanGetPayload<{ include: typeof include }>,
  ): TreatmentPlan => ({
    id: row.id,
    patientId: row.patientId,
    title: row.title,
    notes: row.notes,
    status: row.status as TreatmentPlan["status"],
    editVersion: row.editVersion,
    createdAt: row.createdAt.toISOString(),
    items: row.items.map((item) => exposeItem({ ...item, plan: row })),
    history: row.history.map((change) => ({
      id: change.id,
      kind: change.kind,
      actorId: change.actorId,
      reason: change.reason,
      recordedAt: change.recordedAt.toISOString(),
      before: change.before,
      after: change.after,
    })),
  });
  const audit = (
    clinicId: string,
    planId: string,
    actorId: string,
    kind: string,
    before: unknown,
    after: unknown,
    reason: string | null = null,
  ) =>
    db.treatmentChange.create({
      data: {
        clinicId,
        planId,
        actorId,
        kind,
        reason,
        before: before as Prisma.InputJsonValue,
        after: after as Prisma.InputJsonValue,
      },
    });
  async function revise(clinicId: string, id: string, editVersion: number) {
    const changed = await db.treatmentPlan.updateMany({
      where: { clinicId, id, editVersion },
      data: { editVersion: { increment: 1 } },
    });
    if (changed.count !== 1) throw new ApplicationError("edit_conflict");
  }
  async function unique(operation: () => Promise<unknown>) {
    try {
      await operation();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ApplicationError("edit_conflict");
      throw error;
    }
  }
  return {
    plans: async (clinicId, patientId) =>
      (
        await db.treatmentPlan.findMany({
          where: { clinicId, patientId },
          include,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        })
      ).map(expose),
    plan: async (clinicId, id) => {
      const row = await db.treatmentPlan.findFirst({
        where: { clinicId, id },
        include,
      });
      return row ? expose(row) : null;
    },
    item: async (clinicId, id) => {
      const row = await db.treatmentItem.findFirst({
        where: { clinicId, id },
        include: { plan: true },
      });
      return row ? exposeItem(row) : null;
    },
    async createPlan(clinicId, patientId, actorId, input) {
      await unique(() =>
        db.treatmentPlan.create({ data: { ...input, clinicId, patientId } }),
      );
      await audit(clinicId, input.id, actorId, "plan_created", {}, input);
      return input.id;
    },
    async editPlan(clinicId, current, actorId, input) {
      await revise(clinicId, current.id, input.editVersion);
      const changes =
        input.kind === "edit"
          ? { title: input.title, notes: input.notes }
          : { status: input.status };
      await db.treatmentPlan.update({
        where: { id: current.id },
        data: changes,
      });
      await audit(
        clinicId,
        current.id,
        actorId,
        input.kind === "edit" ? "plan_edited" : "plan_status",
        { title: current.title, notes: current.notes, status: current.status },
        changes,
        input.kind === "status" ? input.reason : null,
      );
    },
    async createItem(clinicId, current, actorId, input) {
      await revise(clinicId, current.id, input.editVersion);
      const { editVersion: _, ...fields } = input;
      await unique(() =>
        db.treatmentItem.create({
          data: { ...fields, clinicId, planId: current.id },
        }),
      );
      await audit(clinicId, current.id, actorId, "item_created", {}, fields);
    },
    async editItem(clinicId, current, actorId, input) {
      const changes =
        input.kind === "edit"
          ? {
              description: input.description,
              location: input.location,
              notes: input.notes,
            }
          : { status: input.status };
      const result = await db.treatmentItem.updateMany({
        where: { clinicId, id: current.id, editVersion: input.editVersion },
        data: { ...changes, editVersion: { increment: 1 } },
      });
      if (result.count !== 1) throw new ApplicationError("edit_conflict");
      await db.treatmentPlan.update({
        where: { id: current.planId },
        data: { editVersion: { increment: 1 } },
      });
      await audit(
        clinicId,
        current.planId,
        actorId,
        input.kind === "edit" ? "item_edited" : "item_status",
        current,
        { id: current.id, ...changes },
        input.kind === "status" ? input.reason : null,
      );
    },
  };
}
