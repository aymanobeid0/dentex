import type { ClinicActor, ClinicMutation } from "../../shared/actor";
import { ApplicationError, AuthorizationError } from "../../shared/errors";
import type { TransactionManager } from "../../shared/transaction-manager";
import type { VisitsScope } from "./visits.dto";
import type { TreatmentPlan, TreatmentProcedure } from "./treatments.dto";
import type {
  PlanCreate,
  PlanEdit,
  ItemCreate,
  ItemEdit,
  ProcedureCreate,
  ProcedureVoid,
} from "./treatments.schemas";

export function createTreatmentsService(
  transactions: TransactionManager<VisitsScope, ClinicMutation>,
) {
  const fail = () => {
    throw new ApplicationError("treatment_not_allowed");
  };
  async function locked<T>(
    actor: ClinicActor,
    run: (scope: VisitsScope) => Promise<T>,
  ) {
    return transactions.run(
      async (scope) => {
        const fresh = scope.actor;
        if (
          !fresh?.active ||
          fresh.credentialVersion !== actor.credentialVersion ||
          !fresh.roles.some((role) => ["admin", "dentist"].includes(role))
        )
          throw new AuthorizationError();
        return run(scope);
      },
      { clinicId: actor.clinicId, actor },
    );
  }
  async function patient(
    scope: VisitsScope,
    actor: ClinicActor,
    id: string,
    write = false,
  ) {
    const [row] = await scope.patients.attendanceReferences(actor.clinicId, [
      id,
    ]);
    if (!row) throw new ApplicationError("not_found");
    if (write && row.archived) throw new ApplicationError("patient_archived");
    return row;
  }
  async function plan(scope: VisitsScope, actor: ClinicActor, id: string) {
    const row = await scope.treatments.plan(actor.clinicId, id);
    if (!row) throw new ApplicationError("not_found");
    return (await expose(scope, actor.clinicId, [row]))[0];
  }
  async function expose(
    scope: VisitsScope,
    clinicId: string,
    rows: TreatmentPlan[],
  ) {
    const names = new Map(
      (
        await scope.employees.attendanceDoctorReferences(
          clinicId,
          rows.flatMap((row) => [
            ...row.history.map((change) => change.actorId),
            ...row.items.flatMap((item) =>
              (item.performances ?? []).flatMap((record) => [
                record.actorId,
                record.visit.doctorId,
                ...(record.voidActorId ? [record.voidActorId] : []),
              ]),
            ),
          ]),
        )
      ).map((user) => [user.id, user.name]),
    );
    return rows.map((row) => ({
      ...row,
      items: row.items.map((item) => ({
        ...item,
        performances: (item.performances ?? []).map((record) =>
          nameProcedure(record, names),
        ),
        procedure: item.procedure ? nameProcedure(item.procedure, names) : null,
      })),
      progress: {
        completed: row.items.filter((item) => item.procedure).length,
        pending: row.items.filter(
          (item) => !item.procedure && item.status === "pending",
        ).length,
        cancelled: row.items.filter(
          (item) => !item.procedure && item.status === "cancelled",
        ).length,
      },
      history: row.history.map((change) => ({
        ...change,
        actorName: names.get(change.actorId) ?? change.actorId,
      })),
    }));
  }
  function nameProcedure(
    row: TreatmentProcedure,
    names: Map<string, string>,
  ): TreatmentProcedure {
    return {
      ...row,
      actorName: names.get(row.actorId) ?? row.actorId,
      voidActorName: row.voidActorId
        ? (names.get(row.voidActorId) ?? row.voidActorId)
        : undefined,
      visit: {
        ...row.visit,
        doctorName: names.get(row.visit.doctorId) ?? row.visit.doctorId,
      },
    };
  }
  async function exposeProcedures(
    scope: VisitsScope,
    clinicId: string,
    rows: TreatmentProcedure[],
  ) {
    const names = new Map(
      (
        await scope.employees.attendanceDoctorReferences(
          clinicId,
          rows.flatMap((row) => [
            row.actorId,
            row.visit.doctorId,
            ...(row.voidActorId ? [row.voidActorId] : []),
          ]),
        )
      ).map((user) => [user.id, user.name]),
    );
    return rows.map((row) => nameProcedure(row, names));
  }
  async function visit(scope: VisitsScope, actor: ClinicActor, id: string) {
    const row = await scope.repository.find(actor.clinicId, id);
    if (!row) throw new ApplicationError("not_found");
    if (!row.visit) throw new ApplicationError("visit_required");
    return { ...row, visit: row.visit };
  }
  async function procedures(
    scope: VisitsScope,
    actor: ClinicActor,
    id: string,
  ) {
    const row = await visit(scope, actor, id),
      p = await patient(scope, actor, row.patientId);
    return {
      patientId: row.patientId,
      visitId: row.visit.id,
      visitVersion: row.visit.editVersion,
      visitStatus: row.visit.status,
      canRecord:
        !p.archived &&
        row.visit.status === "in_progress" &&
        row.visit.startedAt.slice(0, 10) ===
          new Date().toISOString().slice(0, 10),
      items: await exposeProcedures(
        scope,
        actor.clinicId,
        await scope.treatments.procedures(actor.clinicId, row.visit.id),
      ),
      plans: await expose(
        scope,
        actor.clinicId,
        await scope.treatments.plans(actor.clinicId, row.patientId),
      ),
    };
  }
  return {
    procedures: (actor: ClinicActor, id: string) =>
      locked(actor, (scope) => procedures(scope, actor, id)),
    record: (actor: ClinicActor, id: string, input: ProcedureCreate) =>
      locked(actor, async (scope) => {
        const row = await visit(scope, actor, id);
        await patient(scope, actor, row.patientId, true);
        if (row.visit.editVersion !== input.visitVersion)
          throw new ApplicationError("edit_conflict");
        if (
          row.visit.status !== "in_progress" ||
          row.visit.startedAt.slice(0, 10) !==
            new Date().toISOString().slice(0, 10)
        )
          fail();
        let fields: {
          itemId: string | null;
          description: string;
          location: string;
        };
        if (input.source === "plan") {
          const item = await scope.treatments.item(
            actor.clinicId,
            input.itemId,
          );
          if (!item || item.patientId !== row.patientId)
            throw new ApplicationError("not_found");
          const current = await plan(scope, actor, item.planId);
          if (item.editVersion !== input.itemVersion)
            throw new ApplicationError("edit_conflict");
          if (
            current.status !== "active" ||
            item.status !== "pending" ||
            item.procedure
          )
            fail();
          fields = {
            itemId: item.id,
            description: item.description,
            location: item.location,
          };
        } else
          fields = {
            itemId: null,
            description: input.description,
            location: input.location,
          };
        await scope.repository.reviseVisit(
          actor.clinicId,
          row.visit.id,
          input.visitVersion,
        );
        await scope.treatments.recordProcedure(actor.clinicId, {
          id: input.id,
          patientId: row.patientId,
          visitId: row.visit.id,
          ...fields,
          notes: input.notes,
          actorId: actor.userId,
        });
        return procedures(scope, actor, id);
      }),
    void: (actor: ClinicActor, id: string, input: ProcedureVoid) =>
      locked(actor, async (scope) => {
        const current = await scope.treatments.procedure(actor.clinicId, id);
        if (!current) throw new ApplicationError("not_found");
        if (current.editVersion !== input.editVersion)
          throw new ApplicationError("edit_conflict");
        if (current.voidedAt) fail();
        const row = await visit(scope, actor, current.visit.attendanceId);
        await scope.repository.reviseVisit(
          actor.clinicId,
          row.visit.id,
          row.visit.editVersion,
        );
        await scope.treatments.voidProcedure(
          actor.clinicId,
          current,
          actor.userId,
          input.reason,
        );
        return procedures(scope, actor, row.id);
      }),
    list: (actor: ClinicActor, patientId: string) =>
      locked(actor, async (scope) => {
        await patient(scope, actor, patientId);
        return {
          items: await expose(
            scope,
            actor.clinicId,
            await scope.treatments.plans(actor.clinicId, patientId),
          ),
        };
      }),
    createPlan: (actor: ClinicActor, patientId: string, input: PlanCreate) =>
      locked(actor, async (scope) => {
        await patient(scope, actor, patientId, true);
        const id = await scope.treatments.createPlan(
          actor.clinicId,
          patientId,
          actor.userId,
          input,
        );
        return plan(scope, actor, id);
      }),
    edit: (actor: ClinicActor, id: string, input: PlanEdit) =>
      locked(actor, async (scope) => {
        const row = await plan(scope, actor, id);
        await patient(scope, actor, row.patientId, true);
        if (row.editVersion !== input.editVersion)
          throw new ApplicationError("edit_conflict");
        if (input.kind === "edit" && row.status !== "active") fail();
        if (input.kind === "status" && input.status === row.status) fail();
        await scope.treatments.editPlan(
          actor.clinicId,
          row,
          actor.userId,
          input,
        );
        return plan(scope, actor, id);
      }),
    addItem: (actor: ClinicActor, id: string, input: ItemCreate) =>
      locked(actor, async (scope) => {
        const row = await plan(scope, actor, id);
        await patient(scope, actor, row.patientId, true);
        if (row.editVersion !== input.editVersion)
          throw new ApplicationError("edit_conflict");
        if (row.status !== "active") fail();
        await scope.treatments.createItem(
          actor.clinicId,
          row,
          actor.userId,
          input,
        );
        return plan(scope, actor, id);
      }),
    editItem: (actor: ClinicActor, id: string, input: ItemEdit) =>
      locked(actor, async (scope) => {
        const row = await scope.treatments.item(actor.clinicId, id);
        if (!row) throw new ApplicationError("not_found");
        await patient(scope, actor, row.patientId, true);
        const current = await plan(scope, actor, row.planId);
        if (row.editVersion !== input.editVersion)
          throw new ApplicationError("edit_conflict");
        if (
          !!row.procedure ||
          current.status !== "active" ||
          (input.kind === "edit" && row.status !== "pending") ||
          (input.kind === "status" && row.status === input.status)
        )
          fail();
        await scope.treatments.editItem(
          actor.clinicId,
          row,
          actor.userId,
          input,
        );
        return plan(scope, actor, row.planId);
      }),
  };
}
export type TreatmentsService = ReturnType<typeof createTreatmentsService>;
