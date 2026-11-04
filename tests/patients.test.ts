import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app, prisma } from '../server/app';
import { hashPassword } from '../server/password';

describe.skipIf(!process.env.TEST_DATABASE_URL)('patient registration and basic file', () => {
  const origin = 'http://localhost:5173', prefix = `patients-${crypto.randomUUID()}`;
  const clinics: string[] = [], cookies: string[] = [];
  let reader: string, writer: string, neither: string, platform: string, writerRole: string;
  beforeAll(async () => {
    if (new URL(process.env.TEST_DATABASE_URL!).pathname !== '/dentex_test' || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error('Only dentex_test');
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters'; process.env.APP_ORIGIN = origin;
    const used = new Set((await prisma.clinic.findMany({ select: { code: true } })).map(c => c.code));
    const codes = Array.from({ length: 10000 }, (_, i) => String(i).padStart(4, '0')).filter(c => !used.has(c));
    const passwordHash = await hashPassword('test-password');
    let codeIndex = 0;
    async function fixtureClinic() {
      while (codeIndex < codes.length) {
        try { return await prisma.clinic.create({ data: { name: prefix, code: codes[codeIndex++] } }); }
        catch (error) { if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') throw error; }
      }
      throw Error('No free clinic code for test fixture');
    }
    for (let i = 0; i < 2; i++) {
      const clinic = await fixtureClinic(); clinics.push(clinic.id);
      const role = await prisma.role.create({ data: { clinicId: clinic.id, key: 'admin' } });
      const user = await prisma.user.create({ data: { clinicId: clinic.id, name: 'Admin', username: prefix, passwordHash } });
      await prisma.userRole.create({ data: { clinicId: clinic.id, userId: user.id, roleId: role.id } });
      const login = await request(app).post('/api/auth/clinic/login').set('Origin', origin).send({ code: clinic.code, username: prefix, password: 'test-password' });
      cookies.push(login.headers['set-cookie'][0]);
    }
    for (const permission of ['patients.read', 'patients.write']) await prisma.permission.upsert({ where: { key: permission }, create: { key: permission }, update: {} });
    const extra: string[] = [];
    for (const [i, permissions] of [['patients.read'], ['patients.write'], []].entries()) {
      const role = i === 2 ? null : await prisma.role.create({ data: { clinicId: clinics[0], key: i === 0 ? 'dentist' : 'receptionist', permissions: { create: permissions.map(permissionKey => ({ permissionKey })) } } });
      if (i === 1) writerRole = role!.id;
      const user = await prisma.user.create({ data: { clinicId: clinics[0], name: 'Employee', username: `${prefix}-${i}`, passwordHash } });
      if (role) await prisma.userRole.create({ data: { clinicId: clinics[0], userId: user.id, roleId: role.id } });
      extra.push(`dentex_session=${jwt.sign({ kind: 'clinic', version: 1 }, process.env.JWT_SECRET!, { subject: user.id, expiresIn: '24h' })}`);
    }
    [reader, writer, neither] = extra;
    const admin = await prisma.platformAdmin.create({ data: { username: prefix, email: `${prefix}@example.test`, passwordHash } });
    platform = `dentex_session=${jwt.sign({ kind: 'platform', version: 1 }, process.env.JWT_SECRET!, { subject: admin.id, expiresIn: '24h' })}`;
  });
  afterAll(async () => {
    for (const clinicId of clinics) {
      await prisma.userRole.deleteMany({ where: { clinicId } });
      await prisma.user.deleteMany({ where: { clinicId } });
      await prisma.rolePermission.deleteMany({ where: { role: { clinicId } } });
      await prisma.role.deleteMany({ where: { clinicId } });
      await prisma.patient.deleteMany({ where: { clinicId } });
      await prisma.clinic.deleteMany({ where: { id: clinicId } });
    }
    await prisma.platformAdmin.deleteMany({ where: { username: prefix } });
    await prisma.$disconnect();
  });
  const create = (input: object, cookie = cookies[0]) => request(app).post('/api/clinic/patients').set('Origin', origin).set('Cookie', cookie).send(input);
  it('lists only its clinic with summary fields and opens a listed file', async () => {
    const saved = await create({ name: 'Listed patient', phone: '60112233', gender: 'male' });
    await create({ name: 'Other clinic', phone: '60112233', gender: 'male' }, cookies[1]);
    const result = await request(app).get('/api/clinic/patients').set('Cookie', reader);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ items: [{ ...saved.body, name: 'Listed patient', phone: '+22260112233', isChild: false }], page: 1, hasNext: false });
    expect((await request(app).get(`/api/clinic/patients/${result.body.items[0].id}`).set('Cookie', reader)).body.name).toBe('Listed patient');
  });
  it('searches duplicate names, shared phones in registration formats, and complete file numbers', async () => {
    const first = await create({ name: 'Search Marie', phone: '62112233', gender: 'female' });
    const second = await create({ name: 'Search Marie', phone: '62112233', gender: 'female', isChild: true });
    await create({ name: 'Search Marie', phone: '62112233', gender: 'female' }, cookies[1]);
    const search = async (q: string) => (await request(app).get('/api/clinic/patients').query({ q }).set('Cookie', reader)).body;
    const expected = [second.body.id, first.body.id];
    for (const q of ['marIE', '62112233', '+222 62-11-22-33', '٠٠٢٢٢ ٦٢١١٢٢٣٣', '۶۲۱۱۲۲۳۳']) {
      const result = await search(q);
      expect(result.items.map((p: { id: string }) => p.id)).toEqual(expected);
      expect(result.items.map((p: { isChild: boolean }) => p.isChild)).toEqual([true, false]);
    }
    expect((await search(first.body.fileNumber)).items.map((p: { id: string }) => p.id)).toEqual([first.body.id]);
    expect((await search('not found')).items).toEqual([]);
    expect((await search('%')).items).toEqual([]);
    expect((await search('_')).items).toEqual([]);
    expect((await search('999999999999999999999999999999999999')).items).toEqual([]);
  });
  it('paginates a shared phone without omitting participants or repeating rows', async () => {
    const ids: string[] = [];
    for (let index = 0; index < 27; index++) {
      const saved = await create({ name: `Paged child ${index}`, phone: '63112233', gender: 'male', isChild: true });
      expect(saved.status).toBe(201); ids.unshift(saved.body.id);
    }
    const list = async (page: number) => (await request(app).get('/api/clinic/patients').query({ q: '63112233', page }).set('Cookie', reader)).body;
    const first = await list(1), second = await list(2), empty = await list(3);
    expect(first.items).toHaveLength(25); expect(first.hasNext).toBe(true);
    expect(second.items).toHaveLength(2); expect(second.hasNext).toBe(false);
    expect([...first.items, ...second.items].map(p => p.id)).toEqual(ids);
    expect(empty).toEqual({ items: [], page: 3, hasNext: false });
  });
  it.each(['page=0', 'page=-1', 'page=1.5', 'page=1000001', 'q=a&q=b', 'page=1&page=2', 'clinicId=other', 'q=' + 'x'.repeat(201)])('rejects invalid list queries: %s', async query => {
    const result = await request(app).get(`/api/clinic/patients?${query}`).set('Cookie', reader);
    expect(result.status).toBe(400); expect(result.body).toEqual({ error: 'invalid_input' });
  });
  it('protects lists from write-only accounts, program administrators and revoked read access', async () => {
    for (const cookie of [writer, neither, platform]) expect((await request(app).get('/api/clinic/patients').set('Cookie', cookie)).status).toBe(403);
    expect((await request(app).get('/api/clinic/patients')).status).toBe(401);
    const role = await prisma.role.findUniqueOrThrow({ where: { clinicId_key: { clinicId: clinics[0], key: 'dentist' } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    try { expect((await request(app).get('/api/clinic/patients?q=Marie').set('Cookie', reader)).status).toBe(403); }
    finally { await prisma.rolePermission.create({ data: { roleId: role.id, permissionKey: 'patients.read' } }); }
  });
  it('registers a patient and retrieves the saved basic file only within its clinic', async () => {
    const result = await create({ name: '  مريم أحمد  ', phone: '٠٠٢٢٢ ٤٦-١٠-٨٨-٣٤', gender: 'female', birthDate: '2000-02-29', address: ' نواكشوط ', administrativeNote: ' اتصال مساءً ' });
    expect(result.status).toBe(201);
    expect(result.body).toEqual({ id: expect.any(String), fileNumber: expect.stringMatching(/^\d+$/) });
    const file = await request(app).get(`/api/clinic/patients/${result.body.id}`).set('Cookie', cookies[0]);
    expect(file.status).toBe(200);
    expect(file.body).toEqual({ ...result.body, name: 'مريم أحمد', phone: '+22246108834', gender: 'female', isChild: false, birthDate: '2000-02-29', address: 'نواكشوط', administrativeNote: 'اتصال مساءً' });
    expect((await request(app).get(`/api/clinic/patients/${result.body.id}`).set('Cookie', cookies[1])).status).toBe(404);
  });
  it('allows children before and after the adult and normalizes equivalent phone forms', async () => {
    const payload = { name: 'Family member', phone: '۲۲۱۱۲۲۳۳', gender: 'male', isChild: true };
    const first = await create(payload), second = await create({ ...payload, phone: '+222 22-11-22-33' });
    const adult = await create({ ...payload, isChild: false, phone: '0022222112233' });
    const last = await create(payload);
    expect([first.status, second.status, adult.status, last.status]).toEqual([201, 201, 201, 201]);
    expect(new Set([first, second, adult, last].map(r => r.body.fileNumber)).size).toBe(4);
    const duplicate = await create({ ...payload, isChild: false, phone: '22112233' });
    expect(duplicate.status).toBe(409); expect(duplicate.body).toEqual({ error: 'duplicate_phone' });
    expect((await create({ ...payload, isChild: false }, cookies[1])).status).toBe(201);
  });
  it('serializes concurrent adults and assigns distinct file numbers to concurrent children', async () => {
    const payload = { name: 'Concurrent', phone: '33112233', gender: 'female' };
    const adults = await Promise.all([create(payload), create(payload)]);
    expect(adults.map(r => r.status).sort()).toEqual([201, 409]);
    const children = await Promise.all(Array.from({ length: 5 }, () => create({ ...payload, isChild: true })));
    expect(children.map(r => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set([...adults.filter(r => r.status === 201), ...children].map(r => r.body.fileNumber)).size).toBe(6);
  });
  it.each([
    { name: '' }, { phone: '+22146108834' }, { phone: '4610883' }, { phone: 'letters46108834' },
    { gender: 'other' }, { isChild: 'true' }, { birthDate: '2025-02-29' }, { birthDate: '9999-01-01' },
    { clinicId: 'client-controlled' }, { fileNumber: '42' }, { administrativeNote: 'x'.repeat(2001) },
  ])('rejects invalid or client-owned fields %j', async change => {
    const result = await create({ name: 'Invalid', phone: '44112233', gender: 'male', ...change });
    expect(result.status).toBe(400); expect(result.body).toEqual({ error: 'invalid_input' });
  });
  it('separates reading from writing and enforces current permissions, session and origin', async () => {
    const payload = { name: 'Write-only registration', phone: '55112233', gender: 'male' };
    const saved = await create(payload, writer);
    expect(saved.status).toBe(201);
    expect(Object.keys(saved.body).sort()).toEqual(['fileNumber', 'id']);
    const path = `/api/clinic/patients/${saved.body.id}`;
    expect((await request(app).get(path).set('Cookie', writer)).status).toBe(403);
    expect((await request(app).get(path).set('Cookie', reader)).status).toBe(200);
    expect((await create(payload, reader)).status).toBe(403);
    for (const cookie of [neither, platform]) {
      expect((await create(payload, cookie)).status).toBe(403);
      expect((await request(app).get(path).set('Cookie', cookie)).status).toBe(403);
    }
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).post('/api/clinic/patients').set('Origin', origin).send(payload)).status).toBe(401);
    expect((await request(app).post('/api/clinic/patients').set('Cookie', writer).set('Origin', 'https://untrusted.test').send(payload)).status).toBe(403);
    await prisma.rolePermission.deleteMany({ where: { roleId: writerRole } });
    expect((await create({ ...payload, phone: '55112234' }, writer)).status).toBe(403);
    expect((await request(app).get('/api/clinic/patients/not-a-uuid').set('Cookie', reader)).status).toBe(404);
  });
});
