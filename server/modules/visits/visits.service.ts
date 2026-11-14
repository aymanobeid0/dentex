import type { ClinicActor, ClinicMutation } from "../../shared/actor";
import { AuthorizationError, ApplicationError } from "../../shared/errors";
import type { TransactionManager } from "../../shared/transaction-manager";
import type {
  VisitsScope,
  AttendanceRecord,
  AttendanceSnapshot,
} from "./visits.dto";
import type {
  ArriveInput,
  EditAttendanceInput,
  StartInput,
  CompleteInput,
} from "./visits.schemas";
import { VisitsError } from "./visits.errors";
export function createVisitsService(
  transactions: TransactionManager<VisitsScope, ClinicMutation>,
  now: () => Date = () => new Date(),
) {
  function locked<T>(
    actor: ClinicActor,
    operation: (scope: VisitsScope) => Promise<T>,
  ) {
    return transactions.run(
      (scope) => {
        const fresh = scope.actor;
        if (
          !fresh?.active ||
          fresh.credentialVersion !== actor.credentialVersion ||
          !fresh.roles.some((role) =>
            ["admin", "dentist", "receptionist"].includes(role),
          )
        )
          throw new AuthorizationError();
        return operation(scope);
      },
      { clinicId: actor.clinicId, actor },
    );
  }
  async function snapshots(
    scope: VisitsScope,
    clinicId: string,
    records: AttendanceRecord[],
  ): Promise<AttendanceSnapshot[]> {
    const [patients, doctors] = await Promise.all([
      scope.patients.attendanceReferences(
        clinicId,
        records.map((r) => r.patientId),
      ),
      scope.employees.attendanceDoctorReferences(
        clinicId,
        records.map((r) => r.doctorId),
      ),
    ]);
    const patientMap = new Map(patients.map((r) => [r.id, r])),
      doctorMap = new Map(doctors.map((r) => [r.id, r]));
    return records.map(({ patientId, doctorId, ...row }) => {
      const patient = patientMap.get(patientId),
        doctor = doctorMap.get(doctorId);
      if (!patient || !doctor) throw new ApplicationError("not_found");
      return { ...row, patient, doctor };
    });
  }
  return {
    history: (actor: ClinicActor, patientId: string, page: number) =>
      locked(actor, async (scope) => {
        const [patient] = await scope.patients.attendanceReferences(
          actor.clinicId,
          [patientId],
        );
        if (!patient) throw new ApplicationError("not_found");
        const rows = await scope.repository.history(
          actor.clinicId,
          patientId,
          page,
        );
        return {
          items: await snapshots(scope, actor.clinicId, rows.slice(0, 20)),
          page,
          hasNext: rows.length > 20,
        };
      }),
    start: (actor: ClinicActor, id: string, input: StartInput) =>
      locked(actor, async (scope) => {
        const row = await scope.repository.find(actor.clinicId, id);
        if (!row) throw new ApplicationError("not_found");
        if (row.editVersion !== input.editVersion)
          throw new VisitsError("edit_conflict");
        if (row.status !== "waiting")
          throw new VisitsError("attendance_not_waiting");
        const [snapshot] = await snapshots(scope, actor.clinicId, [row]);
        if (snapshot.patient.archived)
          throw new VisitsError("patient_archived");
        if (!snapshot.doctor.eligible)
          throw new VisitsError("doctor_ineligible");
        const active = await scope.repository.activeVisit(
          actor.clinicId,
          row.doctorId,
        );
        const at = now();
        if (input.previous) {
          if (
            !active ||
            active.attendanceId !== input.previous.attendanceId ||
            active.editVersion !== input.previous.visitVersion
          )
            throw new VisitsError("edit_conflict");
          const previous = await scope.repository.find(
            actor.clinicId,
            active.attendanceId,
          );
          if (
            !previous ||
            previous.editVersion !== input.previous.editVersion ||
            previous.status !== "with_doctor"
          )
            throw new VisitsError("edit_conflict");
          await scope.repository.complete(actor.clinicId, previous, at);
        } else if (active) throw new VisitsError("doctor_busy");
        return (
          await snapshots(scope, actor.clinicId, [
            await scope.repository.start(actor.clinicId, row, actor.userId, at),
          ])
        )[0];
      }),
    complete: (actor: ClinicActor, id: string, input: CompleteInput) =>
      locked(actor, async (scope) => {
        const row = await scope.repository.find(actor.clinicId, id);
        if (!row) throw new ApplicationError("not_found");
        if (
          row.editVersion !== input.editVersion ||
          row.visit?.editVersion !== input.visitVersion
        )
          throw new VisitsError("edit_conflict");
        if (row.status !== "with_doctor" || row.visit.status !== "in_progress")
          throw new VisitsError("visit_not_in_progress");
        return (
          await snapshots(scope, actor.clinicId, [
            await scope.repository.complete(actor.clinicId, row, now()),
          ])
        )[0];
      }),
    patients: (actor: ClinicActor, input: { q: string; page: number }) =>
      locked(actor, (scope) =>
        scope.patients.searchAttendancePatients(actor.clinicId, input),
      ),
    doctors: (actor: ClinicActor) =>
      locked(actor, async (scope) => ({
        items: await scope.employees.attendanceDoctors(actor.clinicId),
      })),
    edit: (actor: ClinicActor, id: string, input: EditAttendanceInput) =>
      locked(actor, async (scope) => {
        const current = await scope.repository.find(actor.clinicId, id);
        if (!current) throw new ApplicationError("not_found");
        if (current.editVersion !== input.editVersion)
          throw new VisitsError("edit_conflict");
        if (current.status !== "waiting")
          throw new VisitsError("attendance_not_waiting");
        let doctorId = current.doctorId;
        if (input.kind === "transfer") {
          const [doctor] = await scope.employees.attendanceDoctorReferences(
            actor.clinicId,
            [input.doctorId],
          );
          if (!doctor) throw new ApplicationError("not_found");
          if (!doctor.eligible) throw new VisitsError("doctor_ineligible");
          doctorId = doctor.id;
        }
        const row = await scope.repository.replace(actor.clinicId, current, {
          doctorId,
          status: input.kind === "leave" ? "left_before_entry" : "waiting",
          recordedEndAt: input.kind === "leave" ? now() : null,
        });
        return (await snapshots(scope, actor.clinicId, [row]))[0];
      }),
    list: (actor: ClinicActor) =>
      locked(actor, async (scope) => {
        const items = await snapshots(
          scope,
          actor.clinicId,
          await scope.repository.list(actor.clinicId),
        );
        const eligible = await scope.employees.attendanceDoctors(
          actor.clinicId,
        );
        const doctors = new Map(
          eligible.map((row) => [row.id, { ...row, eligible: true }]),
        );
        for (const row of items) doctors.set(row.doctor.id, row.doctor);
        return { items, doctors: [...doctors.values()] };
      }),
    get: (actor: ClinicActor, id: string) =>
      locked(actor, async (scope) => {
        const row = await scope.repository.find(actor.clinicId, id);
        if (!row) throw new ApplicationError("not_found");
        return (await snapshots(scope, actor.clinicId, [row]))[0];
      }),
    arrive: (actor: ClinicActor, input: ArriveInput) =>
      locked(actor, async (scope) => {
        const [patients, doctors] = await Promise.all([
          scope.patients.attendanceReferences(actor.clinicId, [
            input.patientId,
          ]),
          scope.employees.attendanceDoctorReferences(actor.clinicId, [
            input.doctorId,
          ]),
        ]);
        const patient = patients[0],
          doctor = doctors[0];
        if (!patient || !doctor) throw new ApplicationError("not_found");
        if (patient.archived) throw new VisitsError("patient_archived");
        if (!doctor.eligible) throw new VisitsError("doctor_ineligible");
        const row = await scope.repository.insert({
          ...input,
          clinicId: actor.clinicId,
          createdBy: actor.userId,
          arrivedAt: now(),
        });
        return (await snapshots(scope, actor.clinicId, [row]))[0];
      }),
  };
}
export type VisitsService = ReturnType<typeof createVisitsService>;
