import { describe,it,expect,afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { prisma } from '../server/app';

describe.skipIf(!process.env.TEST_DATABASE_URL)('permission migration',()=>{
  afterAll(async () => { await prisma.$disconnect(); });
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
  });
  it('grants patient registration to all existing dentist roles across clinics without replacing other grants', async () => {
    if (new URL(process.env.TEST_DATABASE_URL!).pathname !== '/dentex_test' || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error('Only dentex_test');
    const sql = await readFile('prisma/migrations/20261104000000_dentist_patient_write/migration.sql', 'utf8');
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('CREATE TEMP TABLE permissions (key text PRIMARY KEY) ON COMMIT DROP');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE roles (id uuid PRIMARY KEY, key text NOT NULL, clinic_id uuid NOT NULL, UNIQUE (clinic_id,key)) ON COMMIT DROP');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE role_permissions (role_id uuid NOT NULL, permission_key text NOT NULL, PRIMARY KEY (role_id,permission_key)) ON COMMIT DROP');
      const firstClinic = crypto.randomUUID(), secondClinic = crypto.randomUUID();
      const initial = [
        { key: 'dentist', clinicId: firstClinic, grants: ['patients.read'], expected: ['patients.read', 'patients.write'] },
        { key: 'dentist', clinicId: secondClinic, grants: ['communications.read'], expected: ['communications.read', 'patients.write'] },
        { key: 'dentist', clinicId: crypto.randomUUID(), grants: [], expected: ['patients.write'] },
        { key: 'dentist', clinicId: crypto.randomUUID(), grants: ['patients.read', 'patients.write'], expected: ['patients.read', 'patients.write'] },
        { key: 'receptionist', clinicId: firstClinic, grants: ['patients.read'], expected: ['patients.read'] },
        { key: 'admin', clinicId: secondClinic, grants: ['employees.manage'], expected: ['employees.manage'] },
      ].map(role => ({ ...role, id: crypto.randomUUID() }));
      for (const role of initial) {
        await tx.$executeRaw`INSERT INTO roles (id,key,clinic_id) VALUES (${role.id}::uuid,${role.key},${role.clinicId}::uuid)`;
        for (const grant of role.grants) await tx.$executeRaw`INSERT INTO role_permissions (role_id,permission_key) VALUES (${role.id}::uuid,${grant})`;
      }
      // The same migration can be safely replayed without duplicating grants.
      for (let pass = 0; pass < 2; pass++) {
        for (const statement of sql.split(';').filter(value => value.trim())) await tx.$executeRawUnsafe(statement);
        for (const role of initial) {
          const grants = await tx.$queryRaw<{ permission_key: string }[]>`SELECT permission_key FROM role_permissions WHERE role_id=${role.id}::uuid ORDER BY permission_key`;
          expect(grants.map(grant => grant.permission_key)).toEqual(role.expected);
        }
      }
      expect(await tx.$queryRaw`SELECT key FROM permissions WHERE key='patients.write'`).toEqual([{ key: 'patients.write' }]);
    });
  });
});
