import { Prisma } from "../../../generated/prisma/client";
import type {
  TreatmentsRepository,
  TreatmentPlan,
  TreatmentItem,
  TreatmentProcedure,
} from "./treatments.dto";
import { ApplicationError } from "../../shared/errors";

export function createTreatmentsRepository(
  db: Prisma.TransactionClient,
): TreatmentsRepository {
  const procedureInclude = {
    visit: {
      select: {
        id: true,
        attendanceId: true,
        doctorId: true,
        startedAt: true,
        status: true,
      },
    },
  };
  const exposeProcedure = (
    row: Prisma.TreatmentProcedureGetPayload<{
      include: typeof procedureInclude;
    }>,
  ): TreatmentProcedure => ({
    id: row.id,
    patientId: row.patientId,
    visitId: row.visitId,
    itemId: row.itemId,
    description: row.description,
    location: row.location,
    notes: row.notes,
    actorId: row.actorId,
    recordedAt: row.recordedAt.toISOString(),
    editVersion: row.editVersion,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidActorId: row.voidActorId,
    voidReason: row.voidReason,
    visit: { ...row.visit, startedAt: row.visit.startedAt.toISOString() },
  });
  const include = {
    items: {
      include: {
        procedures: {
          include: procedureInclude,
          orderBy: [{ recordedAt: "asc" as const }, { id: "asc" as const }],
        },
      },
      orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    },
    history: {
      orderBy: [{ recordedAt: "asc" as const }, { id: "asc" as const }],
    },
  };
  const exposeItem = (
    row: Prisma.TreatmentItemGetPayload<{
      include: { plan: true; procedures: { include: typeof procedureInclude } };
    }>,
  ): TreatmentItem => ({
    id: row.id,
    planId: row.planId,
    patientId: row.plan.patientId,
    description: row.description,
    location: row.location,
    notes: row.notes,
    status: row.status as TreatmentItem["status"],
    editVersion: row.editVersion,
    procedure: row.procedures.find((p) => !p.voidedAt)
      ? exposeProcedure(row.procedures.find((p) => !p.voidedAt)!)
      : null,
    performances: row.procedures.map(exposeProcedure),
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
    procedures: async (clinicId, visitId) =>
      (
        await db.treatmentProcedure.findMany({
          where: { clinicId, visitId },
          include: procedureInclude,
          orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
        })
      ).map(exposeProcedure),
    procedure: async (clinicId, id) => {
      const row = await db.treatmentProcedure.findFirst({
        where: { clinicId, id },
        include: procedureInclude,
      });
      return row ? exposeProcedure(row) : null;
    },
    hasHistory: async (clinicId, visitId) =>
      !!(await db.treatmentProcedure.findFirst({
        where: { clinicId, visitId },
        select: { id: true },
      })),
    async recordProcedure(clinicId, input) {
      await unique(() =>
        db.treatmentProcedure.create({ data: { ...input, clinicId } }),
      );
      if (input.itemId) {
        const item = await db.treatmentItem.update({
          where: { id: input.itemId },
          data: { editVersion: { increment: 1 } },
        });
        await db.treatmentPlan.update({
          where: { id: item.planId },
          data: { editVersion: { increment: 1 } },
        });
        await audit(
          clinicId,
          item.planId,
          input.actorId,
          "procedure_recorded",
          {},
          input,
        );
      }
    },
    async voidProcedure(clinicId, current, actorId, reason) {
      const result = await db.treatmentProcedure.updateMany({
        where: {
          clinicId,
          id: current.id,
          editVersion: current.editVersion,
          voidedAt: null,
        },
        data: {
          voidedAt: new Date(),
          voidActorId: actorId,
          voidReason: reason,
          editVersion: { increment: 1 },
        },
      });
      if (result.count !== 1) throw new ApplicationError("edit_conflict");
      if (current.itemId) {
        const item = await db.treatmentItem.update({
          where: { id: current.itemId },
          data: { editVersion: { increment: 1 } },
        });
        await db.treatmentPlan.update({
          where: { id: item.planId },
          data: { editVersion: { increment: 1 } },
        });
        await audit(
          clinicId,
          item.planId,
          actorId,
          "procedure_voided",
          {
            id: current.id,
            description: current.description,
            location: current.location,
            notes: current.notes,
          },
          { id: current.id, status: "voided" },
          reason,
        );
      }
    },
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
        include: {
          plan: true,
          procedures: {
            include: procedureInclude,
            orderBy: [{ recordedAt: "asc" as const }, { id: "asc" as const }],
          },
        },
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
