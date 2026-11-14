import { Prisma } from "../../../generated/prisma/client";
import type {
  VisitsRepository,
  AttendanceStatus,
  VisitRecord,
  CorrectionRecord,
  CorrectionState,
} from "./visits.dto";
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
    effectiveClosedAt: true,
    autoClosedRecordedAt: true,
    editVersion: true,
    corrections: {
      orderBy: [{ recordedAt: "asc" as const }, { id: "asc" as const }],
      select: {
        id: true,
        kind: true,
        actorId: true,
        reason: true,
        recordedAt: true,
        before: true,
        after: true,
      },
    },
    visits: {
      orderBy: [{ startedAt: "desc" as const }, { id: "desc" as const }],
      select: {
        id: true,
        status: true,
        startedAt: true,
        recordedEndAt: true,
        effectiveClosedAt: true,
        autoClosedRecordedAt: true,
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
    effectiveClosedAt: Date | null;
    autoClosedRecordedAt: Date | null;
    editVersion: number;
    corrections: Array<{
      id: string;
      kind: string;
      actorId: string;
      reason: string | null;
      recordedAt: Date;
      before: Prisma.JsonValue;
      after: Prisma.JsonValue;
    }>;
    visits: Array<{
      id: string;
      status: string;
      startedAt: Date;
      recordedEndAt: Date | null;
      effectiveClosedAt: Date | null;
      autoClosedRecordedAt: Date | null;
      editVersion: number;
    }>;
  }) => {
    const {
      visits,
      corrections,
      effectiveClosedAt,
      autoClosedRecordedAt,
      ...attendance
    } = row;
    const closure = (effective: Date | null, recorded: Date | null) =>
      effective && recorded
        ? {
            autoClosure: {
              effectiveClosedAt: effective.toISOString(),
              recordedAt: recorded.toISOString(),
              reason: "clinic_day_end" as const,
            },
          }
        : {};
    const exposeVisit = ({
      effectiveClosedAt,
      autoClosedRecordedAt,
      ...visit
    }: (typeof visits)[number]) => ({
      ...visit,
      ...closure(effectiveClosedAt, autoClosedRecordedAt),
      status: visit.status as VisitRecord["status"],
      startedAt: visit.startedAt.toISOString(),
      recordedEndAt: visit.recordedEndAt?.toISOString() ?? null,
    });
    const valid = visits.find(
      (visit) => visit.status !== "entry_recorded_in_error",
    );
    return {
      ...attendance,
      ...closure(effectiveClosedAt, autoClosedRecordedAt),
      ...(valid ? { visit: exposeVisit(valid) } : {}),
      ...(visits.some((visit) => visit.status === "entry_recorded_in_error")
        ? {
            invalidEntries: visits
              .filter((visit) => visit.status === "entry_recorded_in_error")
              .map(exposeVisit),
          }
        : {}),
      ...(corrections.length
        ? {
            corrections: corrections.map((change) => ({
              ...change,
              recordedAt: change.recordedAt.toISOString(),
              before: change.before as CorrectionState,
              after: change.after as CorrectionState,
            })),
          }
        : {}),
      status: row.status as AttendanceStatus,
      arrivedAt: row.arrivedAt.toISOString(),
      recordedEndAt: row.recordedEndAt?.toISOString() ?? null,
    };
  };
  return {
    async dueClinics(before) {
      return (
        await database.attendance.findMany({
          where: {
            status: { in: ["waiting", "with_doctor"] },
            arrivedAt: { lt: before },
          },
          distinct: ["clinicId"],
          select: { clinicId: true },
          orderBy: { clinicId: "asc" },
        })
      ).map((row) => row.clinicId);
    },
    async autoClose(clinicId, current, effectiveAt, recordedAt) {
      if (current.visit?.status === "in_progress") {
        const changed = await database.visit.updateMany({
          where: {
            clinicId,
            id: current.visit.id,
            editVersion: current.visit.editVersion,
            status: "in_progress",
          },
          data: {
            status: "auto_closed",
            effectiveClosedAt: effectiveAt,
            autoClosedRecordedAt: recordedAt,
            editVersion: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new VisitsError("edit_conflict");
      }
      const changed = await database.attendance.updateMany({
        where: {
          clinicId,
          id: current.id,
          editVersion: current.editVersion,
          status: { in: ["waiting", "with_doctor"] },
        },
        data: {
          status: "auto_closed",
          effectiveClosedAt: effectiveAt,
          autoClosedRecordedAt: recordedAt,
          editVersion: { increment: 1 },
          updatedAt: recordedAt,
        },
      });
      if (changed.count !== 1) throw new VisitsError("edit_conflict");
    },
    async activeAttendance(clinicId, patientId, excluding) {
      return !!(await database.attendance.findFirst({
        where: {
          clinicId,
          patientId,
          id: { not: excluding },
          status: { in: ["waiting", "with_doctor"] },
        },
        select: { id: true },
      }));
    },
    async correct(clinicId, current, next, actorId, kind, reason, at) {
      const state = (row: typeof current): CorrectionState => ({
        status: row.status,
        recordedEndAt: row.recordedEndAt,
        ...(row.visit
          ? {
              visit: {
                id: row.visit.id,
                status: row.visit.status,
                recordedEndAt: row.visit.recordedEndAt,
              },
            }
          : {}),
      });
      const before = state(current);
      if (next.visitStatus) {
        const changed = await database.visit.updateMany({
          where: {
            clinicId,
            id: current.visit!.id,
            editVersion: current.visit!.editVersion,
          },
          data: {
            status: next.visitStatus,
            editVersion: { increment: 1 },
            ...(next.visitStatus === "in_progress"
              ? { recordedEndAt: null }
              : next.visitStatus === "completed"
                ? { recordedEndAt: at }
                : {}),
          },
        });
        if (changed.count !== 1) throw new VisitsError("edit_conflict");
      }
      const changed = await database.attendance.updateMany({
        where: { clinicId, id: current.id, editVersion: current.editVersion },
        data: {
          status: next.status,
          recordedEndAt: next.recordedEndAt,
          editVersion: { increment: 1 },
          updatedAt: at,
        },
      });
      if (changed.count !== 1) throw new VisitsError("edit_conflict");
      const after: CorrectionState = {
        ...before,
        status: next.status,
        recordedEndAt: next.recordedEndAt?.toISOString() ?? null,
        ...(next.visitStatus
          ? {
              visit: {
                ...before.visit!,
                status: next.visitStatus,
                recordedEndAt:
                  next.visitStatus === "in_progress"
                    ? null
                    : next.visitStatus === "completed"
                      ? at.toISOString()
                      : before.visit!.recordedEndAt,
              },
            }
          : {}),
      };
      await database.attendanceCorrection.create({
        data: {
          clinicId,
          attendanceId: current.id,
          actorId,
          kind,
          reason,
          recordedAt: at,
          before: before as unknown as Prisma.InputJsonValue,
          after: after as unknown as Prisma.InputJsonValue,
        },
      });
      return expose(
        await database.attendance.findFirstOrThrow({
          where: { clinicId, id: current.id },
          select,
        }),
      );
    },
    async remove(clinicId, current) {
      await database.attendanceCorrection.deleteMany({
        where: { clinicId, attendanceId: current.id },
      });
      await database.visit.deleteMany({
        where: {
          clinicId,
          attendanceId: current.id,
          status: "entry_recorded_in_error",
        },
      });
      const result = await database.attendance.deleteMany({
        where: {
          clinicId,
          id: current.id,
          editVersion: current.editVersion,
          visits: { none: { status: { not: "entry_recorded_in_error" } } },
        },
      });
      if (result.count !== 1) throw new VisitsError("edit_conflict");
    },
    async reviseVisit(clinicId, id, editVersion) {
      const changed = await database.visit.updateMany({
        where: { clinicId, id, editVersion },
        data: { editVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw new VisitsError("edit_conflict");
    },
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
