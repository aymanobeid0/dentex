import { Prisma } from '../../../generated/prisma/client';
import type { Patient, PatientsRepository } from './patients.dto';
import { PatientsError } from './patients.errors';

export function createPatientsRepository(database: Prisma.TransactionClient): PatientsRepository {
  return {
    async insert(clinicId, input) {
      try {
        const patient = await database.patient.create({ data: { ...input, clinicId, birthDate: input.birthDate ? new Date(`${input.birthDate}T00:00:00.000Z`) : null }, select: { id: true, fileNumber: true } });
        return { id: patient.id, fileNumber: patient.fileNumber.toString() };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new PatientsError('duplicate_phone');
        throw error;
      }
    },
    async find(clinicId, id) {
      const row = await database.patient.findFirst({ where: { clinicId, id }, select: { id: true, fileNumber: true, name: true, phone: true, gender: true, isChild: true, birthDate: true, address: true, administrativeNote: true } });
      if (!row) return null;
      return { ...row, gender: row.gender as Patient['gender'], fileNumber: row.fileNumber.toString(), birthDate: row.birthDate?.toISOString().slice(0, 10) ?? null };
    },
  };
}
