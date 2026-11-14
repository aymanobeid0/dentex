import { Prisma } from "../../../generated/prisma/client";
import type { VisitsRepository, AttendanceStatus } from "./visits.dto";
import { VisitsError } from "./visits.errors";
export function createVisitsRepository(
  database: Prisma.TransactionClient,
): VisitsRepository {
  const select = {
    id: true,
    patientId: true,
    doctorId: true,
    status: true,
    arrivedAt: true,
    recordedEndAt: true,
    editVersion: true,
    visits: {
      orderBy: [{ startedAt: "desc" as const }, { id: "desc" as const }],
      take: 1,
      select: {
        id: true,
        status: true,
        startedAt: true,
        recordedEndAt: true,
        editVersion: true,
      },
    },
  } satisfies Prisma.AttendanceSelect;
  const expose = (row: {
    id: string;
    patientId: string;
    doctorId: string;
    status: string;
    arrivedAt: Date;
    recordedEndAt: Date | null;
    editVersion: number;
    visits: Array<{
      id: string;
      status: string;
      startedAt: Date;
      recordedEndAt: Date | null;
      editVersion: number;
    }>;
  }) => {
    const { visits, ...attendance } = row;
    return {
      ...attendance,
      ...(visits[0]
        ? {
            visit: {
              ...visits[0],
              status: visits[0].status as "in_progress" | "completed",
              startedAt: visits[0].startedAt.toISOString(),
              recordedEndAt: visits[0].recordedEndAt?.toISOString() ?? null,
            },
          }
        : {}),
      status: row.status as AttendanceStatus,
      arrivedAt: row.arrivedAt.toISOString(),
      recordedEndAt: row.recordedEndAt?.toISOString() ?? null,
    };
  };
  return {
    async history(clinicId, patientId, page) {
      return (
        await database.attendance.findMany({
          where: { clinicId, patientId },
          select,
          orderBy: [{ arrivedAt: "desc" }, { arrivalSequence: "desc" }],
          skip: (page - 1) * 20,
          take: 21,
        })
      ).map(expose);
    },
    async activeVisit(clinicId, doctorId) {
      const row = await database.visit.findFirst({
        where: { clinicId, doctorId, status: "in_progress" },
      });
      return row
        ? {
            ...row,
            status: row.status as "in_progress",
            startedAt: row.startedAt.toISOString(),
            recordedEndAt: row.recordedEndAt?.toISOString() ?? null,
          }
        : null;
    },
    async start(clinicId, current, actorId, at) {
      await database.visit.create({
        data: {
          clinicId,
          attendanceId: current.id,
          patientId: current.patientId,
          doctorId: current.doctorId,
          createdBy: actorId,
          startedAt: at,
        },
      });
      const updated = await database.attendance.updateMany({
        where: {
          clinicId,
          id: current.id,
          editVersion: current.editVersion,
          status: "waiting",
        },
        data: {
          status: "with_doctor",
          editVersion: { increment: 1 },
          updatedAt: at,
        },
      });
      if (updated.count !== 1) throw new VisitsError("edit_conflict");
      return expose(
        await database.attendance.findFirstOrThrow({
          where: { clinicId, id: current.id },
          select,
        }),
      );
    },
    async complete(clinicId, current, at) {
      const updated = await database.visit.updateMany({
        where: {
          clinicId,
          id: current.visit!.id,
          editVersion: current.visit!.editVersion,
          status: "in_progress",
        },
        data: {
          status: "completed",
          recordedEndAt: at,
          editVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new VisitsError("edit_conflict");
      const attendance = await database.attendance.updateMany({
        where: {
          clinicId,
          id: current.id,
          editVersion: current.editVersion,
          status: "with_doctor",
        },
        data: {
          status: "completed",
          recordedEndAt: at,
          editVersion: { increment: 1 },
          updatedAt: at,
        },
      });
      if (attendance.count !== 1) throw new VisitsError("edit_conflict");
      return expose(
        await database.attendance.findFirstOrThrow({
          where: { clinicId, id: current.id },
          select,
        }),
      );
    },
    async replace(clinicId, current, next) {
      const result = await database.attendance.updateMany({
        where: {
          clinicId,
          id: current.id,
          editVersion: current.editVersion,
          status: "waiting",
        },
        data: { ...next, editVersion: { increment: 1 }, updatedAt: new Date() },
      });
      if (result.count !== 1) throw new VisitsError("edit_conflict");
      const row = await database.attendance.findFirstOrThrow({
        where: { clinicId, id: current.id },
        select,
      });
      return expose(row);
    },
    async list(clinicId) {
      return (
        await database.attendance.findMany({
          where: { clinicId, status: { in: ["waiting", "with_doctor"] } },
          select,
          orderBy: [{ arrivedAt: "asc" }, { arrivalSequence: "asc" }],
        })
      ).map(expose);
    },
    async find(clinicId, id) {
      const row = await database.attendance.findFirst({
        where: { clinicId, id },
        select,
      });
      return row ? expose(row) : null;
    },
    async insert(input) {
      try {
        return expose(
          await database.attendance.create({ data: input, select }),
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw new VisitsError("attendance_active");
        throw error;
      }
    },
  };
}
