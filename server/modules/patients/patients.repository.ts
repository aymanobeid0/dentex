import { Prisma } from "../../../generated/prisma/client";
import type { Patient, PatientsRepository } from "./patients.dto";
import { PatientsError } from "./patients.errors";

export function createPatientsRepository(
  database: Prisma.TransactionClient,
): PatientsRepository {
  return {
    async appointmentReferences(clinicId, patientIds, input) {
      const matches: Prisma.PatientWhereInput[] = [
        {
          name: {
            contains: input.q.replace(
              /[\\%_]/g,
              (character) => `\\${character}`,
            ),
            mode: "insensitive",
          },
        },
      ];
      if (input.normalizedPhone) matches.push({ phone: input.normalizedPhone });
      if (input.fileNumber !== null)
        matches.push({ fileNumber: BigInt(input.fileNumber) });
      const rows = await database.patient.findMany({
        where: {
          clinicId,
          id: { in: [...patientIds] },
          ...(input.q ? { OR: matches } : {}),
        },
        select: {
          id: true,
          name: true,
          phone: true,
          fileNumber: true,
          archived: true,
        },
      });
      return rows.map((row) => ({
        ...row,
        fileNumber: row.fileNumber.toString(),
      }));
    },
    async appointmentReference(clinicId, id) {
      const row = await database.patient.findFirst({
        where: { clinicId, id },
        select: { id: true, name: true, fileNumber: true, archived: true },
      });
      return row ? { ...row, fileNumber: row.fileNumber.toString() } : null;
    },
    async findOldNumber(clinicId, oldFileNumber) {
      const history = await database.patientNumberHistory.findUnique({
        where: {
          clinicId_oldFileNumber: {
            clinicId,
            oldFileNumber: BigInt(oldFileNumber),
          },
        },
        select: {
          patient: { select: { id: true, name: true, fileNumber: true } },
        },
      });
      return history
        ? {
            ...history.patient,
            fileNumber: history.patient.fileNumber.toString(),
          }
        : null;
    },
    async initializeNumbering(clinicId, start) {
      await database.patientNumbering.create({
        data: {
          clinicId,
          start: BigInt(start),
          lastNumber: BigInt(start) - 1n,
        },
      });
    },
    async list(clinicId, input) {
      const matches: Prisma.PatientWhereInput[] = [
        {
          name: {
            contains: input.q.replace(
              /[\\%_]/g,
              (character) => `\\${character}`,
            ),
            mode: "insensitive",
          },
        },
      ];
      if (input.normalizedPhone) matches.push({ phone: input.normalizedPhone });
      if (input.fileNumber !== null)
        matches.push({ fileNumber: BigInt(input.fileNumber) });
      const rows = await database.patient.findMany({
        where: {
          clinicId,
          ...(input.status === "all"
            ? {}
            : { archived: input.status === "archived" }),
          ...(input.q ? { OR: matches } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { fileNumber: "desc" }],
        skip: (input.page - 1) * 25,
        take: 26,
        select: {
          id: true,
          fileNumber: true,
          name: true,
          phone: true,
          isChild: true,
          archived: true,
        },
      });
      return {
        items: rows
          .slice(0, 25)
          .map((row) => ({ ...row, fileNumber: row.fileNumber.toString() })),
        page: input.page,
        hasNext: rows.length > 25,
      };
    },
    async insert(clinicId, input) {
      try {
        const allocated = await database.$queryRaw<
          { last_number: bigint }[]
        >`UPDATE patient_numbering SET last_number = last_number + 1 WHERE clinic_id = ${clinicId}::uuid AND last_number < 9223372036854775807 RETURNING last_number`;
        if (!allocated.length) throw new PatientsError("numbering_exhausted");
        const patient = await database.patient.create({
          data: {
            ...input,
            clinicId,
            fileNumber: allocated[0].last_number,
            birthDate: input.birthDate
              ? new Date(`${input.birthDate}T00:00:00.000Z`)
              : null,
          },
          select: { id: true, fileNumber: true },
        });
        return { id: patient.id, fileNumber: patient.fileNumber.toString() };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw new PatientsError("duplicate_phone");
        throw error;
      }
    },
    async find(clinicId, id) {
      const row = await database.patient.findFirst({
        where: { clinicId, id },
        select: {
          id: true,
          fileNumber: true,
          editVersion: true,
          archived: true,
          name: true,
          phone: true,
          gender: true,
          isChild: true,
          birthDate: true,
          address: true,
          administrativeNote: true,
        },
      });
      if (!row) return null;
      return {
        ...row,
        gender: row.gender as Patient["gender"],
        fileNumber: row.fileNumber.toString(),
        birthDate: row.birthDate?.toISOString().slice(0, 10) ?? null,
      };
    },
    async replaceDetails(clinicId, id, input) {
      const { editVersion, ...fields } = input;
      try {
        const result = await database.patient.updateMany({
          where: { clinicId, id, editVersion, archived: false },
          data: {
            ...fields,
            birthDate: fields.birthDate
              ? new Date(`${fields.birthDate}T00:00:00.000Z`)
              : null,
            editVersion: { increment: 1 },
          },
        });
        if (!result.count) throw new PatientsError("edit_conflict");
        const row = await database.patient.findFirstOrThrow({
          where: { clinicId, id },
          select: { id: true, fileNumber: true, editVersion: true },
        });
        return { ...row, fileNumber: row.fileNumber.toString() };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw new PatientsError("duplicate_phone");
        throw error;
      }
    },
    async setArchived(clinicId, id, input) {
      const result = await database.patient.updateMany({
        where: { clinicId, id, editVersion: input.editVersion },
        data: { archived: input.archived, editVersion: { increment: 1 } },
      });
      if (!result.count) throw new PatientsError("edit_conflict");
      const row = await database.patient.findFirstOrThrow({
        where: { clinicId, id },
        select: {
          id: true,
          fileNumber: true,
          editVersion: true,
          archived: true,
        },
      });
      return { ...row, fileNumber: row.fileNumber.toString() };
    },
  };
}
