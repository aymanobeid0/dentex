import 'dotenv/config';
import { createPrismaClient } from '../server/database';
import { hashPassword } from '../server/password';

const { PLATFORM_ADMIN_USERNAME: username, PLATFORM_ADMIN_EMAIL: email, PLATFORM_ADMIN_PASSWORD: password } = process.env;
if (!username?.trim() || !email?.trim() || !password || password.length < 8) throw new Error('Set PLATFORM_ADMIN_USERNAME, PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD (at least 8 characters).');
const prisma = createPrismaClient();
try {
  const passwordHash = await hashPassword(password);
  await prisma.platformAdmin.upsert({ where: { username: username.trim() }, create: { username: username.trim(), email: email.trim(), passwordHash }, update: { email: email.trim(), passwordHash, active: true, credentialVersion: { increment: 1 } } });
  console.log('Platform administrator saved.');
} finally { await prisma.$disconnect(); }
