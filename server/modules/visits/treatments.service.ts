import type { ClinicActor, ClinicMutation } from "../../shared/actor";
import { ApplicationError, AuthorizationError } from "../../shared/errors";
import type { TransactionManager } from "../../shared/transaction-manager";
import type { VisitsScope } from "./visits.dto";
import type { TreatmentPlan } from "./treatments.dto";
import type {
  PlanCreate,
  PlanEdit,
  ItemCreate,
  ItemEdit,
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
          rows.flatMap((row) => row.history.map((change) => change.actorId)),
        )
      ).map((user) => [user.id, user.name]),
    );
    return rows.map((row) => ({
      ...row,
      history: row.history.map((change) => ({
        ...change,
        actorName: names.get(change.actorId) ?? change.actorId,
      })),
    }));
  }
  return {
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
