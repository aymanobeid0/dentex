import { Prisma } from '../../../generated/prisma/client';
import type { ClinicsRepository } from './clinics.dto';
import { ClinicsError } from './clinics.errors';
export function createClinicsRepository(database: Prisma.TransactionClient): ClinicsRepository {
  const select = { id: true, name: true, code: true } as const;
  return {
    listClinics: () => database.clinic.findMany({ select, orderBy: { name: 'asc' } }),
    findClinic: id => database.clinic.findUnique({ where: { id }, select }),
    findCode: code => database.clinic.findUnique({ where: { code }, select }),
    async insertClinic(input) {
      try { return await database.clinic.create({ data: input, select }); }
      catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ClinicsError('duplicate_code');
        throw error;
      }
    },
    async lockClinic(id) { await database.$queryRaw`SELECT id FROM clinics WHERE id = ${id}::uuid FOR UPDATE`; },
  };
}
