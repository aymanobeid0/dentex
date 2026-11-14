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
  } as const;
  const expose = (row: {
    id: string;
    patientId: string;
    doctorId: string;
    status: string;
    arrivedAt: Date;
    recordedEndAt: Date | null;
    editVersion: number;
  }) => ({
    ...row,
    status: row.status as AttendanceStatus,
    arrivedAt: row.arrivedAt.toISOString(),
    recordedEndAt: row.recordedEndAt?.toISOString() ?? null,
  });
  return {
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
          where: { clinicId, status: "waiting" },
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
