import type { ClinicActor, ClinicMutation } from "../../shared/actor";
import { AuthorizationError, ApplicationError } from "../../shared/errors";
import type { TransactionManager } from "../../shared/transaction-manager";
import type { AppointmentRecord, AppointmentsScope } from "./appointments.dto";
import type {
  BookAppointmentInput,
  ListAppointmentsInput,
  EditAppointmentInput,
} from "./appointments.schemas";
import { AppointmentsError } from "./appointments.errors";

export function createAppointmentsService(
  transactions: TransactionManager<AppointmentsScope, ClinicMutation>,
  now: () => Date = () => new Date(),
) {
  function locked<T>(
    actor: ClinicActor,
    operation: (scope: AppointmentsScope) => Promise<T>,
    permissions = ["appointments.write"],
    any = false,
  ) {
    return transactions.run(
      (scope) => {
        const fresh = scope.actor;
        if (
          !fresh?.active ||
          fresh.credentialVersion !== actor.credentialVersion ||
          !(
            fresh.roles.includes("admin") ||
            (any
              ? permissions.some((key) => fresh.permissions.includes(key))
              : permissions.every((key) => fresh.permissions.includes(key)))
          )
        )
          throw new AuthorizationError();
        return operation(scope);
      },
      { clinicId: actor.clinicId, actor },
    );
  }
  async function rows(
    scope: AppointmentsScope,
    clinicId: string,
    records: AppointmentRecord[],
  ) {
    const [patients, doctors] = await Promise.all([
      scope.patients.appointmentReferences(
        clinicId,
        records.map((row) => row.patientId),
      ),
      scope.employees.appointmentStaffReferences(
        clinicId,
        records.map((row) => row.doctorId),
      ),
    ]);
    const patientMap = new Map(patients.map((item) => [item.id, item]));
    const doctorMap = new Map(doctors.map((item) => [item.id, item]));
    return records.map((row) => {
      const patient = patientMap.get(row.patientId),
        doctor = doctorMap.get(row.doctorId);
      if (!patient || !doctor) throw new ApplicationError("not_found");
      return {
        id: row.id,
        patient: {
          id: patient.id,
          name: patient.name,
          fileNumber: patient.fileNumber,
          archived: patient.archived,
        },
        doctor,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        status: row.status,
        editVersion: row.editVersion,
      };
    });
  }
  return {
    edit: (actor: ClinicActor, id: string, input: EditAppointmentInput) =>
      locked(
        actor,
        async (scope) => {
          const current = await scope.repository.find(actor.clinicId, id);
          if (!current) throw new ApplicationError("not_found");
          if (current.editVersion !== input.editVersion)
            throw new AppointmentsError("edit_conflict");
          const patient = await scope.patients.appointmentReference(
            actor.clinicId,
            current.patientId,
          );
          if (!patient) throw new ApplicationError("not_found");
          if (
            patient.archived &&
            !(input.kind === "status" && input.status === "cancelled")
          )
            throw new AppointmentsError("patient_archived");
          const next = { ...current };
          if (input.kind === "schedule") {
            if (current.status !== "booked")
              throw new AppointmentsError("appointment_not_booked");
            const doctor = await scope.employees.appointmentDoctor(
              actor.clinicId,
              input.doctorId,
            );
            if (!doctor)
              throw new AppointmentsError("appointment_reference_not_found");
            if (!doctor.eligible)
              throw new AppointmentsError("doctor_ineligible");
            const start = new Date(`${input.date}T${input.time}:00.000Z`),
              end = new Date(start.getTime() + input.durationMinutes * 60000);
            if (
              end.getTime() >
              new Date(`${input.date}T00:00:00.000Z`).getTime() + 86400000
            )
              throw new ApplicationError("invalid_input");
            if (start.getTime() < now().getTime())
              throw new AppointmentsError("appointment_in_past");
            next.doctorId = doctor.id;
            next.startsAt = start.toISOString();
            next.endsAt = end.toISOString();
          } else if (input.kind === "note")
            next.administrativeNote = input.administrativeNote;
          else next.status = input.status;
          if (
            (input.kind === "schedule" || input.kind === "status") &&
            ["booked", "attended"].includes(next.status)
          ) {
            if (
              await scope.repository.overlaps({
                clinicId: actor.clinicId,
                patientId: next.patientId,
                doctorId: next.doctorId,
                createdBy: current.createdBy,
                startsAt: new Date(next.startsAt),
                endsAt: new Date(next.endsAt),
                administrativeNote: next.administrativeNote,
                excludeId: id,
              })
            )
              throw new AppointmentsError("appointment_overlap");
          }
          return scope.repository.replace(
            actor.clinicId,
            current,
            next,
            actor.userId,
            input.kind,
            input.kind === "status" ? input.cancellationReason : undefined,
          );
        },
        ["appointments.read", "appointments.write"],
      ),
    patients: (actor: ClinicActor, input: { q: string; page: number }) =>
      locked(actor, (scope) =>
        scope.patients.searchAppointmentPatients(actor.clinicId, input),
      ),
    list: (actor: ClinicActor, input: ListAppointmentsInput) =>
      locked(
        actor,
        async (scope) => {
          const startsAt = new Date(`${input.date}T00:00:00.000Z`);
          if (input.view === "week")
            startsAt.setUTCDate(
              startsAt.getUTCDate() - ((startsAt.getUTCDay() + 6) % 7),
            );
          if (input.view === "month") startsAt.setUTCDate(1);
          const before = new Date(startsAt);
          if (input.view === "month")
            before.setUTCMonth(before.getUTCMonth() + 1);
          else
            before.setUTCDate(
              before.getUTCDate() + (input.view === "week" ? 7 : 1),
            );
          const filter = {
            startsAt,
            before,
            doctorId: input.doctorId,
            status: input.status,
          };
          const patientIds = input.q
            ? (
                await scope.patients.appointmentReferences(
                  actor.clinicId,
                  await scope.repository.patientIds(actor.clinicId, filter),
                  input.q,
                )
              ).map((row) => row.id)
            : undefined;
          const result = await scope.repository.list(
            actor.clinicId,
            { ...filter, patientIds },
            input.view === "day" ? input.page : undefined,
          );
          return {
            items: await rows(scope, actor.clinicId, result.items),
            total: result.total,
            page: input.page,
            hasNext: input.view === "day" && input.page * 50 < result.total,
          };
        },
        ["appointments.read"],
      ),
    patient: (actor: ClinicActor, patientId: string, page: number) =>
      locked(
        actor,
        async (scope) => {
          if (
            !(await scope.patients.appointmentReference(
              actor.clinicId,
              patientId,
            ))
          )
            throw new ApplicationError("not_found");
          const result = await scope.repository.list(
            actor.clinicId,
            { patientIds: [patientId] },
            page,
            true,
          );
          return {
            items: await rows(scope, actor.clinicId, result.items),
            total: result.total,
            page,
            hasNext: page * 50 < result.total,
          };
        },
        ["appointments.read", "patients.read"],
      ),
    get: (actor: ClinicActor, id: string) =>
      locked(
        actor,
        async (scope) => {
          const record = await scope.repository.find(actor.clinicId, id);
          if (!record) throw new ApplicationError("not_found");
          const [row] = await rows(scope, actor.clinicId, [record]);
          const [patient] = await scope.patients.appointmentReferences(
            actor.clinicId,
            [record.patientId],
          );
          const changes = await scope.repository.changes(actor.clinicId, id);
          const doctorIdOf = (value: unknown) =>
            value &&
            typeof value === "object" &&
            "doctorId" in value &&
            typeof value.doctorId === "string"
              ? [value.doctorId]
              : [];
          const staff = await scope.employees.appointmentStaffReferences(
            actor.clinicId,
            [
              record.createdBy,
              ...changes.map((change) => change.actorId),
              ...changes.flatMap((change) => [
                ...doctorIdOf(change.before),
                ...doctorIdOf(change.after),
              ]),
            ],
          );
          const names = new Map(
            staff.map((user) => [user.id, { id: user.id, name: user.name }]),
          );
          const withDoctor = (value: unknown) => {
            const [doctorId] = doctorIdOf(value);
            return doctorId && value && typeof value === "object"
              ? { ...value, doctor: names.get(doctorId) }
              : value;
          };
          return {
            ...row,
            patient: { ...row.patient, phone: patient.phone },
            administrativeNote: record.administrativeNote,
            createdAt: record.createdAt,
            createdBy: names.get(record.createdBy),
            changes: changes.map(({ actorId, ...change }) => ({
              ...change,
              before: withDoctor(change.before),
              after: withDoctor(change.after),
              actor: names.get(actorId),
            })),
          };
        },
        ["appointments.read"],
      ),
    doctors: (actor: ClinicActor) =>
      locked(
        actor,
        async (scope) => ({
          items: await scope.employees.appointmentDoctors(actor.clinicId),
        }),
        ["appointments.read", "appointments.write"],
        true,
      ),
    book: (actor: ClinicActor, input: BookAppointmentInput) =>
      locked(actor, async (scope) => {
        const patient = await scope.patients.appointmentReference(
          actor.clinicId,
          input.patientId,
        );
        if (!patient)
          throw new AppointmentsError("appointment_reference_not_found");
        if (patient.archived) throw new AppointmentsError("patient_archived");
        const doctor = await scope.employees.appointmentDoctor(
          actor.clinicId,
          input.doctorId,
        );
        if (!doctor)
          throw new AppointmentsError("appointment_reference_not_found");
        if (!doctor.eligible) throw new AppointmentsError("doctor_ineligible");
        // Current clinic time is Africa/Nouakchott (UTC+00); do not parse in the device/server local zone.
        const startsAt = new Date(`${input.date}T${input.time}:00.000Z`);
        const endsAt = new Date(
          startsAt.getTime() + input.durationMinutes * 60000,
        );
        const midnight =
          new Date(`${input.date}T00:00:00.000Z`).getTime() + 86400000;
        if (endsAt.getTime() > midnight)
          throw new ApplicationError("invalid_input");
        if (startsAt.getTime() < now().getTime())
          throw new AppointmentsError("appointment_in_past");
        const record = {
          clinicId: actor.clinicId,
          patientId: patient.id,
          doctorId: doctor.id,
          createdBy: actor.userId,
          startsAt,
          endsAt,
          administrativeNote: input.administrativeNote,
        };
        if (await scope.repository.overlaps(record))
          throw new AppointmentsError("appointment_overlap");
        return scope.repository.insert(record);
      }),
  };
}
export type AppointmentsService = ReturnType<typeof createAppointmentsService>;
