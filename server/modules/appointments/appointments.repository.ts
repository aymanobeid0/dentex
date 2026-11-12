import { Prisma } from "../../../generated/prisma/client";
import type {
  AppointmentReceipt,
  AppointmentsRepository,
} from "./appointments.dto";
import { AppointmentsError } from "./appointments.errors";

function exclusionViolation(error: unknown) {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2010"
  )
    return false;
  if (error.meta?.code === "23P01") return true;
  const adapter = error.meta?.driverAdapterError;
  if (!adapter || typeof adapter !== "object" || !("cause" in adapter))
    return false;
  const cause = adapter.cause;
  return (
    !!cause &&
    typeof cause === "object" &&
    "originalCode" in cause &&
    cause.originalCode === "23P01"
  );
}

export function createAppointmentsRepository(
  database: Prisma.TransactionClient,
): AppointmentsRepository {
  return {
    async overlaps(input) {
      return !!(await database.appointment.findFirst({
        where: {
          clinicId: input.clinicId,
          status: { in: ["booked", "attended"] },
          startsAt: { lt: input.endsAt },
          endsAt: { gt: input.startsAt },
          OR: [{ doctorId: input.doctorId }, { patientId: input.patientId }],
        },
        select: { id: true },
      }));
    },
    async insert(input) {
      try {
        const [row] = await database.$queryRaw<
          Array<{ id: string; startsAt: Date; endsAt: Date }>
        >`
          INSERT INTO appointments (clinic_id, patient_id, doctor_id, created_by, starts_at, ends_at, administrative_note)
          VALUES (${input.clinicId}::uuid, ${input.patientId}::uuid, ${input.doctorId}::uuid, ${input.createdBy}::uuid, ${input.startsAt}, ${input.endsAt}, ${input.administrativeNote})
          RETURNING id, starts_at AS "startsAt", ends_at AS "endsAt"`;
        const receipt: AppointmentReceipt = {
          id: row.id,
          patientId: input.patientId,
          doctorId: input.doctorId,
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
          status: "booked",
          editVersion: 1,
        };
        await database.appointmentChange.create({
          data: {
            clinicId: input.clinicId,
            appointmentId: row.id,
            actorId: input.createdBy,
            action: "created",
            after: { ...receipt, administrativeNote: input.administrativeNote },
          },
        });
        return receipt;
      } catch (error) {
        if (exclusionViolation(error))
          throw new AppointmentsError("appointment_overlap");
        throw error;
      }
    },
  };
}
