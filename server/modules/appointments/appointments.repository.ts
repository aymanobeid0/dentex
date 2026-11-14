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
    async visitReferences(clinicId, input) {
      const rows = await database.appointment.findMany({
        where: {
          clinicId,
          patientId: input.patientId,
          startsAt: {
            gte: new Date(`${input.day}T00:00:00Z`),
            lt: new Date(
              new Date(`${input.day}T00:00:00Z`).getTime() + 86400000,
            ),
          },
        },
        select: {
          id: true,
          patientId: true,
          doctorId: true,
          startsAt: true,
          status: true,
          editVersion: true,
        },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      });
      return rows.map((row) => ({
        ...row,
        startsAt: row.startsAt.toISOString(),
        status: row.status as import("./appointments.dto").AppointmentStatus,
      }));
    },
    async visitLinks(clinicId, visitIds) {
      const rows = await database.appointmentVisitLink.findMany({
        where: { clinicId, visitId: { in: [...visitIds] } },
        select: {
          visitId: true,
          appointmentId: true,
          editVersion: true,
          appointment: {
            select: {
              id: true,
              patientId: true,
              doctorId: true,
              startsAt: true,
              status: true,
              editVersion: true,
            },
          },
        },
      });
      const byId = new Map(
        rows.map((row) => [
          row.visitId,
          {
            ...row,
            appointment: row.appointment
              ? {
                  ...row.appointment,
                  startsAt: row.appointment.startsAt.toISOString(),
                  status: row.appointment
                    .status as import("./appointments.dto").AppointmentStatus,
                }
              : null,
          },
        ]),
      );
      return visitIds.map(
        (visitId) =>
          byId.get(visitId) ?? { visitId, appointmentId: null, editVersion: 0 },
      );
    },
    async visitPins(clinicId, appointmentId) {
      return database.appointmentVisitPin.findMany({
        where: { clinicId, appointmentId, valid: true },
        select: { visitId: true, visitDay: true },
      });
    },
    async saveVisitLink(clinicId, input, previous) {
      const appointmentId =
        input.kind === "assign" ? input.appointmentId : null;
      const next = {
        visitId: input.visitId,
        appointmentId,
        editVersion: previous.editVersion + 1,
      };
      try {
        if (input.kind === "assign")
          await database.appointmentVisitPin.upsert({
            where: {
              clinicId_appointmentId_visitId: {
                clinicId,
                appointmentId: input.appointmentId,
                visitId: input.visitId,
              },
            },
            create: {
              clinicId,
              appointmentId: input.appointmentId,
              visitId: input.visitId,
              visitDay: input.visitDay,
            },
            update: { valid: true, visitDay: input.visitDay },
          });
        if (input.kind === "invalidateEntry")
          await database.appointmentVisitPin.updateMany({
            where: { clinicId, visitId: input.visitId, valid: true },
            data: { valid: false },
          });
        if (previous.editVersion === 0)
          await database.appointmentVisitLink.create({
            data: { clinicId, ...next },
          });
        else {
          const updated = await database.appointmentVisitLink.updateMany({
            where: {
              clinicId,
              visitId: input.visitId,
              editVersion: previous.editVersion,
            },
            data: { appointmentId, editVersion: next.editVersion },
          });
          if (updated.count !== 1) throw new AppointmentsError("edit_conflict");
        }
        await database.appointmentVisitChange.create({
          data: {
            clinicId,
            visitId: input.visitId,
            actorId: input.actorId,
            action: input.kind,
            before: { ...previous },
            after: { ...next },
          },
        });
        return next;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw new AppointmentsError("appointment_visit_reserved");
        throw error;
      }
    },
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
