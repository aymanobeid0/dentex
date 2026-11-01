import { describe,it,expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { prisma } from '../server/app';

describe.skipIf(!process.env.TEST_DATABASE_URL)('permission migration',()=>{
  it('initializes empty roles without overwriting existing grants',async()=>{
    if (!process.env.TEST_DATABASE_URL || new URL(process.env.TEST_DATABASE_URL).pathname !== '/dentex_test' || process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL) throw Error('Refusing fixtures outside dentex_test');
    const sql=await readFile('prisma/migrations/20261101010000_role_permissions/migration.sql','utf8');
    await prisma.$transaction(async tx=>{
      await tx.$executeRawUnsafe('CREATE TEMP TABLE permissions (key text PRIMARY KEY) ON COMMIT DROP');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE roles (id uuid PRIMARY KEY, key text NOT NULL) ON COMMIT DROP');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE role_permissions (role_id uuid NOT NULL, permission_key text NOT NULL, PRIMARY KEY (role_id,permission_key)) ON COMMIT DROP');
      const dentist=crypto.randomUUID(),reception=crypto.randomUUID();
      await tx.$executeRaw`INSERT INTO roles (id,key) VALUES (${dentist}::uuid,'dentist'),(${reception}::uuid,'receptionist')`;
      await tx.$executeRaw`INSERT INTO role_permissions (role_id,permission_key) VALUES (${reception}::uuid,'patients.write')`;
      for(const statement of sql.split(';').filter(s=>s.trim())) await tx.$executeRawUnsafe(statement);
      const dentistGrants=await tx.$queryRaw<{permission_key:string}[]>`SELECT permission_key FROM role_permissions WHERE role_id=${dentist}::uuid`;
      expect(dentistGrants.map(g=>g.permission_key)).toContain('patient_financial.read');
      const receptionGrants=await tx.$queryRaw<{permission_key:string}[]>`SELECT permission_key FROM role_permissions WHERE role_id=${reception}::uuid`;
      expect(receptionGrants.map(g=>g.permission_key)).toEqual(['patients.write']);
    });
    await prisma.$disconnect();
  });
});
