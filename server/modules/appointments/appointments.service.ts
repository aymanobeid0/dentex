import type { ClinicActor, ClinicMutation } from "../../shared/actor";
import { AuthorizationError, ApplicationError } from "../../shared/errors";
import type { TransactionManager } from "../../shared/transaction-manager";
import type { AppointmentsScope } from "./appointments.dto";
import type { BookAppointmentInput } from "./appointments.schemas";
import { AppointmentsError } from "./appointments.errors";

export function createAppointmentsService(
  transactions: TransactionManager<AppointmentsScope, ClinicMutation>,
  now: () => Date = () => new Date(),
) {
  function locked<T>(
    actor: ClinicActor,
    operation: (scope: AppointmentsScope) => Promise<T>,
  ) {
    return transactions.run(
      (scope) => {
        const fresh = scope.actor;
        if (
          !fresh?.active ||
          fresh.credentialVersion !== actor.credentialVersion ||
          !(
            fresh.roles.includes("admin") ||
            fresh.permissions.includes("appointments.write")
          )
        )
          throw new AuthorizationError();
        return operation(scope);
      },
      { clinicId: actor.clinicId, actor },
    );
  }
  return {
    doctors: (actor: ClinicActor) =>
      locked(actor, async (scope) => ({
        items: await scope.employees.appointmentDoctors(actor.clinicId),
      })),
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
