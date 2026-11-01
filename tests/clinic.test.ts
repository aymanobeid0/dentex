import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app, prisma } from '../server/app';
import { hashPassword } from '../server/password';

describe('clinic creation authorization', () => {
  it('rejects an anonymous creation request', async () => {
    process.env.APP_ORIGIN = 'http://localhost:5173';
    const r = await request(app).post('/api/clinics').set('Origin', process.env.APP_ORIGIN).send({});
    expect(r.status).toBe(401);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)('creating a clinic', () => {
  const origin = 'http://localhost:5173';
  const username = `test-${crypto.randomUUID()}`;
  const name = `Clinic ${crypto.randomUUID()}`;
  const code = String(Math.floor(Math.random() * 9000) + 1000);
  let cookie: string;
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || new URL(process.env.TEST_DATABASE_URL).pathname !== '/dentex_test' || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error('Refusing fixtures outside dentex_test');
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    process.env.APP_ORIGIN = origin;
    await prisma.platformAdmin.create({ data: { username, email: `${username}@example.test`, passwordHash: await hashPassword('test-password') } });
    const login = await request(app).post('/api/auth/platform/login').set('Origin', origin).send({ username, password:'test-password' });
    cookie = login.headers['set-cookie'][0];
  });
  afterAll(async () => {
    const clinics = await prisma.clinic.findMany({ where: { name } });
    for (const c of clinics) {
      await prisma.userRole.deleteMany({ where: { clinicId: c.id } });
      await prisma.user.deleteMany({ where: { clinicId: c.id } });
      await prisma.rolePermission.deleteMany({ where: { role: { clinicId: c.id } } });
      await prisma.role.deleteMany({ where: { clinicId: c.id } });
      await prisma.clinic.delete({ where: { id: c.id } });
    }
    await prisma.platformAdmin.deleteMany({ where: { username } });
    await prisma.$disconnect();
  });
  it('creates a clinic with an initial manager and preserves a leading zero', async () => {
    const r = await request(app).post('/api/clinics').set('Origin', origin).set('Cookie', cookie).send({ name, code:'0'+code.slice(1), managerName:'Test Manager', managerUsername:username, managerPassword:'test-password' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ name, code:'0'+code.slice(1) });
    expect(r.body).not.toHaveProperty('passwordHash');
    const list = await request(app).get('/api/clinics').set('Cookie', cookie);
    expect(list.body).toContainEqual(expect.objectContaining({ id:r.body.id, name, code:'0'+code.slice(1) }));
    // These data have no public read/login API until tickets 03 and 04.
    const manager = await prisma.user.findFirstOrThrow({ where: { clinicId:r.body.id, username }, include:{ userRoles:{ include:{ role:true } } } });
    expect(manager.userRoles.map(ur => ur.role.key)).toEqual(['admin']);
    expect((await prisma.role.findMany({ where:{ clinicId:r.body.id }, select:{ key:true } })).map(role => role.key).sort()).toEqual(['admin','dentist','receptionist']);
    expect(manager.passwordHash).not.toBe('test-password');

  });
  it('rejects a clinic identity even if it has a valid signed token', async () => {
    const token = jwt.sign({ kind:'clinic', version:1 }, process.env.JWT_SECRET!, { subject:crypto.randomUUID(), expiresIn:'24h' });
    const response = await request(app).post('/api/clinics').set('Origin', origin).set('Cookie', `dentex_session=${token}`).send({ name, code, managerName:'Test', managerUsername:username, managerPassword:'test-password' });
    expect(response.status).toBe(401);
  });
  it('rejects invalid codes and duplicate codes', async () => {
    const payload = { name, code:'123', managerName:'Test Manager', managerUsername:username, managerPassword:'test-password' };
    expect((await request(app).post('/api/clinics').set('Origin', origin).set('Cookie', cookie).send(payload)).status).toBe(400);
    payload.code = '0'+code.slice(1);
    const duplicate = await request(app).post('/api/clinics').set('Origin', origin).set('Cookie', cookie).send(payload);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({ error:'duplicate_code' });
  });
  it('rolls back the clinic when creating its manager fails', async () => {
    // A temporary database trigger simulates a late database failure in the isolated test database.
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION dentex_test_fail_manager() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name = 'dentex-forced-failure' THEN RAISE EXCEPTION 'forced failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER dentex_test_fail_manager BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION dentex_test_fail_manager()`);
    try {
      const failedName = `${name}-failure`;
      const response = await request(app).post('/api/clinics').set('Origin', origin).set('Cookie', cookie).send({ name:failedName, code, managerName:'dentex-forced-failure', managerUsername:username, managerPassword:'test-password' });
      expect(response.status).toBe(500);
      const list = await request(app).get('/api/clinics').set('Cookie', cookie);
      expect(list.body).not.toContainEqual(expect.objectContaining({ name:failedName }));
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS dentex_test_fail_manager ON users');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS dentex_test_fail_manager()');
    }
  });

});
