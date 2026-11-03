import type { Prisma } from '../../../generated/prisma/client';
import type { AuthRepository } from './auth.dto';

export function createAuthRepository(database: Prisma.TransactionClient): AuthRepository {
  const select = { id: true, username: true, passwordHash: true, active: true, credentialVersion: true } as const;
  return {
    findPlatformByUsername: username => database.platformAdmin.findUnique({ where: { username }, select }),
    findPlatformById: id => database.platformAdmin.findUnique({ where: { id }, select }),
    async lockPlatform(id) { await database.$queryRaw`SELECT id FROM platform_admins WHERE id = ${id}::uuid FOR UPDATE`; },
  };
}
