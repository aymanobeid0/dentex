import { Prisma } from "../../../generated/prisma/client";
import type {
  AppointmentReceipt,
  AppointmentsRepository,
  AppointmentFilter,
  AppointmentSnapshot,
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
  const where = (
    clinicId: string,
    filter: AppointmentFilter,
  ): Prisma.AppointmentWhereInput => ({
    clinicId,
    ...(filter.startsAt || filter.before
      ? { startsAt: { gte: filter.startsAt, lt: filter.before } }
      : {}),
    ...(filter.doctorId ? { doctorId: filter.doctorId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.patientIds ? { patientId: { in: filter.patientIds } } : {}),
  });
  const select = {
    id: true,
    patientId: true,
    doctorId: true,
    startsAt: true,
    endsAt: true,
    status: true,
    editVersion: true,
    administrativeNote: true,
    createdBy: true,
    createdAt: true,
  } as const;
  const expose = (row: {
    id: string;
    patientId: string;
    doctorId: string;
    startsAt: Date;
    endsAt: Date;
    status: string;
    editVersion: number;
    administrativeNote: string | null;
    createdBy: string;
    createdAt: Date;
  }) => ({
    ...row,
    status: row.status as import("./appointments.dto").AppointmentStatus,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  });
  return {
    async replace(
      clinicId,
      previous,
      next,
      actorId,
      action,
      cancellationReason,
    ) {
      const snapshot = (record: typeof previous): AppointmentSnapshot => ({
        id: record.id,
        patientId: record.patientId,
        doctorId: record.doctorId,
        startsAt: record.startsAt,
        endsAt: record.endsAt,
        status: record.status,
        editVersion: record.editVersion,
        administrativeNote: record.administrativeNote,
      });
      try {
        const changed = await database.$queryRaw<Array<{ id: string }>>`
          UPDATE appointments SET doctor_id=${next.doctorId}::uuid, starts_at=${new Date(next.startsAt)}, ends_at=${new Date(next.endsAt)}, status=${next.status}, administrative_note=${next.administrativeNote}, edit_version=edit_version+1, updated_at=now()
          WHERE clinic_id=${clinicId}::uuid AND id=${previous.id}::uuid AND edit_version=${previous.editVersion}
          RETURNING id`;
        if (!changed.length) throw new AppointmentsError("edit_conflict");
        const before = snapshot(previous),
          after = snapshot({ ...next, editVersion: previous.editVersion + 1 });
        await database.appointmentChange.create({
          data: {
            clinicId,
            appointmentId: previous.id,
            actorId,
            action,
            before: { ...before },
            after: {
              ...after,
              ...(action === "status" && next.status === "cancelled"
                ? { cancellationReason: cancellationReason || null }
                : {}),
            },
          },
        });
        return after;
      } catch (error) {
        if (exclusionViolation(error))
          throw new AppointmentsError("appointment_overlap");
        throw error;
      }
    },
    async patientIds(clinicId, filter) {
      return (
        await database.appointment.findMany({
          where: where(clinicId, filter),
          distinct: ["patientId"],
          select: { patientId: true },
        })
      ).map((row) => row.patientId);
    },
    async list(clinicId, filter, page, descending = false) {
      const [rows, total] = await Promise.all([
        database.appointment.findMany({
          where: where(clinicId, filter),
          select,
          orderBy: [
            { startsAt: descending ? "desc" : "asc" },
            { id: descending ? "desc" : "asc" },
          ],
          skip: page === undefined ? undefined : (page - 1) * 50,
          take: page === undefined ? undefined : 50,
        }),
        database.appointment.count({ where: where(clinicId, filter) }),
      ]);
      return { items: rows.map(expose), total };
    },
    async find(clinicId, id) {
      const row = await database.appointment.findFirst({
        where: { clinicId, id },
        select,
      });
      return row ? expose(row) : null;
    },
    async changes(clinicId, appointmentId) {
      const rows = await database.appointmentChange.findMany({
        where: { clinicId, appointmentId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          actorId: true,
          action: true,
          createdAt: true,
          before: true,
          after: true,
        },
      });
      return rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      }));
    },
    async overlaps(input) {
      return !!(await database.appointment.findFirst({
        where: {
          clinicId: input.clinicId,
          ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
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
