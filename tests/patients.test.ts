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
      await prisma.patientNumbering.create({ data: { clinicId: clinic.id, start: 1n, lastNumber: 0n } });
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
  const edit = (id: string, input: object, cookie = cookies[0]) => request(app).put(`/api/clinic/patients/${id}`).set('Origin', origin).set('Cookie', cookie).send(input);
  const read = (id: string) => request(app).get(`/api/clinic/patients/${id}`).set('Cookie', reader);
  const archive = (id: string, archived: boolean, editVersion: number, cookie = cookies[0]) => request(app).patch(`/api/clinic/patients/${id}/archive`).set('Origin', origin).set('Cookie', cookie).send({ archived, editVersion });
  it('starts independent clinic sequences at one and never reuses an archived number', async () => {
    const input = { name: 'Numbering', phone: '20112233', gender: 'male', isChild: true };
    const first = await create(input), other = await create(input, cookies[1]);
    expect([first.body.fileNumber, other.body.fileNumber]).toEqual(['1', '1']);
    expect((await archive(first.body.id, true, 1)).status).toBe(200);
    const next = await create(input);
    expect(next.body.fileNumber).toBe('2');
    expect((await archive(first.body.id, false, 2)).status).toBe(200);
    // Keep earlier list tests isolated from these numbering fixtures.
    await prisma.patient.deleteMany({ where: { id: { in: [first.body.id, other.body.id, next.body.id] } } });
  });
  it('allocates concurrent numbers independently and rejects exhaustion without wrapping', async () => {
    const input = { name: 'Capacity fixture', phone: '20112233', gender: 'female', isChild: true };
    const results = await Promise.all(Array.from({ length: 8 }, () => create(input)));
    expect(results.map(r => r.status)).toEqual(Array(8).fill(201));
    expect(results.map(r => BigInt(r.body.fileNumber)).sort((a,b) => a < b ? -1 : 1)).toEqual([3n,4n,5n,6n,7n,8n,9n,10n]);
    const independent = await create(input, cookies[1]);
    expect(independent.body.fileNumber).toBe('2');
    await prisma.patientNumbering.update({ where: { clinicId: clinics[0] }, data: { lastNumber: 9223372036854775806n } });
    const last = await create(input), exhausted = await create(input);
    expect(last.body.fileNumber).toBe('9223372036854775807');
    expect(exhausted.status).toBe(409);
    expect(exhausted.body).toEqual({ error: 'numbering_exhausted' });
    expect((await read(last.body.id)).body.fileNumber).toBe('9223372036854775807');
    await prisma.patient.deleteMany({ where: { id: { in: [...results.map(r => r.body.id), independent.body.id, last.body.id] } } });
    await prisma.patientNumbering.update({ where: { clinicId: clinics[0] }, data: { lastNumber: 10n } });
  });
  it('lists only its clinic with summary fields and opens a listed file', async () => {
    const saved = await create({ name: 'Listed patient', phone: '60112233', gender: 'male' });
    await create({ name: 'Other clinic', phone: '60112233', gender: 'male' }, cookies[1]);
    const result = await request(app).get('/api/clinic/patients').set('Cookie', reader);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ items: [{ ...saved.body, name: 'Listed patient', phone: '+22260112233', isChild: false, archived: false }], page: 1, hasNext: false });
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
    await prisma.patientNumberHistory.create({ data: { clinicId: clinics[0], oldFileNumber: BigInt(first.body.fileNumber), patientId: second.body.id } });
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
  it('looks up individual old numbers only for current clinic administrators without mixing normal search', async () => {
    const input = { name: 'History current', phone: '25112233', gender: 'female', isChild: true };
    const first = await create(input), second = await create({ ...input, name: 'History target' });
    const other = await create({ ...input, name: 'Foreign history' }, cookies[1]);
    const old = first.body.fileNumber;
    await prisma.patientNumberHistory.create({ data: { clinicId: clinics[0], oldFileNumber: BigInt(old), patientId: second.body.id } });
    await prisma.patientNumberHistory.create({ data: { clinicId: clinics[1], oldFileNumber: BigInt(old), patientId: other.body.id } });
    const lookup = (number = old, cookie = cookies[0]) => request(app).get(`/api/clinic/patients/numbering-history/${number}`).set('Cookie', cookie);
    expect((await lookup()).status).toBe(200);
    expect((await lookup()).body).toEqual({ ...second.body, name: 'History target' });
    expect((await lookup(old, cookies[1])).body).toEqual({ ...other.body, name: 'Foreign history' });
    const ordinary = await request(app).get('/api/clinic/patients').query({ q: old }).set('Cookie', cookies[0]);
    expect(ordinary.body.items.map((p: { id: string }) => p.id)).toEqual([first.body.id]);
    expect((await request(app).get(`/api/clinic/patients/${second.body.id}`).set('Cookie', cookies[0])).body.id).toBe(second.body.id);
    for (const cookie of [reader, writer, neither, platform]) expect((await lookup(old, cookie)).status).toBe(403);
    expect((await request(app).get(`/api/clinic/patients/numbering-history/${old}`)).status).toBe(401);
    for (const invalid of ['0', '-1', '1.5', 'abc', '9223372036854775808']) expect((await lookup(invalid)).status).toBe(400);
    expect((await lookup('9223372036854775807')).status).toBe(404);
    expect((await lookup(second.body.fileNumber)).status).toBe(404);
    expect((await archive(second.body.id, true, 1)).status).toBe(200);
    expect((await lookup()).body.id).toBe(second.body.id);
    const numberAr = old.replace(/\d/g, (digit: string) => String.fromCharCode(0x660 + Number(digit)));
    expect((await lookup(encodeURIComponent(numberAr))).body.id).toBe(second.body.id);
    const role = await prisma.role.findUniqueOrThrow({ where: { clinicId_key: { clinicId: clinics[0], key: 'admin' } } });
    const assignment = await prisma.userRole.findFirstOrThrow({ where: { roleId: role.id } });
    await prisma.userRole.delete({ where: { userId_roleId: { userId: assignment.userId, roleId: role.id } } });
    try { expect((await lookup()).status).toBe(403); }
    finally { await prisma.userRole.create({ data: assignment }); }
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
    expect(file.body).toEqual({ ...result.body, editVersion: 1, archived: false, name: 'مريم أحمد', phone: '+22246108834', gender: 'female', isChild: false, birthDate: '2000-02-29', address: 'نواكشوط', administrativeNote: 'اتصال مساءً' });
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
  it('edits the complete basic file, normalizes its phone and preserves its identity', async () => {
    const saved = await create({ name: 'Before edit', phone: '70112233', gender: 'male' });
    const result = await edit(saved.body.id, { name: ' After edit ', phone: '٠٠٢٢٢ ٧٠-١١-٢٢-٣٣', gender: 'female', isChild: true, birthDate: '2001-02-03', address: ' Here ', administrativeNote: ' Call ', editVersion: 1 });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ...saved.body, editVersion: 2 });
    expect((await read(saved.body.id)).body).toEqual({ ...saved.body, archived: false, name: 'After edit', phone: '+22270112233', gender: 'female', isChild: true, birthDate: '2001-02-03', address: 'Here', administrativeNote: 'Call', editVersion: 2 });
  });
  it('rejects a child becoming a second adult atomically, then permits another phone', async () => {
    const base = { name: 'Parent', phone: '71112233', gender: 'female' };
    await create(base);
    const child = await create({ ...base, name: 'Child', isChild: true });
    const result = await edit(child.body.id, { ...base, name: 'Rejected name', isChild: false, editVersion: 1 });
    expect(result.status).toBe(409); expect(result.body).toEqual({ error: 'duplicate_phone' });
    expect((await read(child.body.id)).body).toMatchObject({ name: 'Child', isChild: true, editVersion: 1 });
    expect((await edit(child.body.id, { ...base, name: 'Adult now', phone: '71112234', editVersion: 1 })).status).toBe(200);
    expect((await read(child.body.id)).body).toMatchObject({ ...child.body, name: 'Adult now', isChild: false, phone: '+22271112234', editVersion: 2 });
  });
  it('serializes stale editors and concurrent claims on one adult phone without partial writes', async () => {
    const input = { name: 'Concurrent edit', phone: '72112233', gender: 'male' };
    const first = await create(input), second = await create({ ...input, phone: '72112234' });
    const updates = await Promise.all([edit(first.body.id, { ...input, name: 'Winner A', editVersion: 1 }), edit(first.body.id, { ...input, name: 'Winner B', editVersion: 1 })]);
    expect(updates.map(r => r.status).sort()).toEqual([200, 409]);
    expect(updates.find(r => r.status === 409)?.body).toEqual({ error: 'edit_conflict' });
    const latest = (await read(first.body.id)).body;
    expect(latest.editVersion).toBe(2);
    const claims = await Promise.all([edit(first.body.id, { ...input, phone: '72112235', editVersion: 2 }), edit(second.body.id, { ...input, phone: '72112235', editVersion: 1 })]);
    expect(claims.map(r => r.status).sort()).toEqual([200, 409]);
    expect(claims.find(r => r.status === 409)?.body).toEqual({ error: 'duplicate_phone' });
    const loser = claims[0].status === 409 ? first : second;
    expect((await read(loser.body.id)).body).toMatchObject(claims[0].status === 409 ? latest : { name: input.name, phone: '+22272112234', editVersion: 1 });
  });
  it('enforces edit permissions, tenant, origin, immutable fields and required version', async () => {
    const base = { name: 'Protected edit', phone: '73112233', gender: 'male', editVersion: 1 };
    const saved = await create({ name: base.name, phone: base.phone, gender: base.gender });
    const path = `/api/clinic/patients/${saved.body.id}`;
    for (const cookie of [reader, neither, platform]) expect((await edit(saved.body.id, base, cookie)).status).toBe(403);
    expect((await edit(saved.body.id, base, cookies[1])).status).toBe(404);
    expect((await request(app).put(path).set('Origin', origin).send(base)).status).toBe(401);
    expect((await request(app).put(path).set('Cookie', writer).set('Origin', 'https://untrusted.test').send(base)).status).toBe(403);
    for (const change of [{ editVersion: undefined }, { editVersion: 0 }, { editVersion: 1.5 }, { editVersion: 2147483647 }, { fileNumber: '9' }, { clinicId: clinics[1] }, { id: saved.body.id }, { phone: '123' }, { name: '' }]) {
      expect((await edit(saved.body.id, { ...base, ...change })).status).toBe(400);
    }
    expect((await edit('not-a-uuid', base)).status).toBe(404);
    const success = await edit(saved.body.id, { ...base, name: 'Writer can edit' }, writer);
    expect(success.status).toBe(200); expect(Object.keys(success.body).sort()).toEqual(['editVersion', 'fileNumber', 'id']);
    await prisma.rolePermission.deleteMany({ where: { roleId: writerRole } });
    try { expect((await edit(saved.body.id, { ...base, editVersion: 2 }, writer)).status).toBe(403); }
    finally { await prisma.rolePermission.create({ data: { roleId: writerRole, permissionKey: 'patients.write' } }); }
    expect((await read(saved.body.id)).body).toMatchObject({ name: 'Writer can edit', editVersion: 2 });
  });
  it('archives without deleting data, filters shared phones and restores the same file', async () => {
    const input = { name: 'Archive adult', phone: '74112233', gender: 'female' };
    const saved = await create(input);
    const child = await create({ ...input, name: 'Archive child', isChild: true });
    const before = (await read(saved.body.id)).body;
    const result = await archive(saved.body.id, true, 1);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ...saved.body, archived: true, editVersion: 2 });
    expect((await read(saved.body.id)).body).toEqual({ ...before, archived: true, editVersion: 2 });
    const search = async (status?: string) => (await request(app).get('/api/clinic/patients').query({ q: '٠٠٢٢٢ ٧٤١١٢٢٣٣', ...(status ? { status } : {}) }).set('Cookie', reader)).body.items;
    expect((await search()).map((p: { id: string }) => p.id)).toEqual([child.body.id]);
    expect((await search('archived')).map((p: { id: string }) => p.id)).toEqual([saved.body.id]);
    expect((await search('all')).map((p: { id: string }) => p.id)).toEqual([child.body.id, saved.body.id]);
    expect((await create(input)).status).toBe(409);
    expect((await edit(saved.body.id, { ...input, name: 'Must not persist', editVersion: 2 })).body).toEqual({ error: 'patient_archived' });
    const restored = await archive(saved.body.id, false, 2);
    expect(restored.status).toBe(200); expect(restored.body).toEqual({ ...saved.body, archived: false, editVersion: 3 });
    expect((await read(saved.body.id)).body).toEqual({ ...before, editVersion: 3 });
  });
  it('serializes archive/edit races and rejects stale restoration without changing the archived file', async () => {
    const input = { name: 'Archive race', phone: '75112233', gender: 'female' };
    for (let index = 0; index < 4; index++) {
      const saved = await create({ ...input, phone: `7511223${index}`, isChild: true });
      const results = await Promise.all([archive(saved.body.id, true, 1), edit(saved.body.id, { ...input, name: 'Racing edit', isChild: true, editVersion: 1 })]);
      expect(results.map(r => r.status).sort()).toEqual([200, 409]);
      const first = (await read(saved.body.id)).body;
      if (!first.archived) expect((await archive(saved.body.id, true, 2)).status).toBe(200);
      const archived = (await read(saved.body.id)).body;
      const rejected = await edit(saved.body.id, { ...input, name: 'Too late', editVersion: archived.editVersion });
      expect(rejected.status).toBe(409); expect(rejected.body).toEqual({ error: 'patient_archived' });
      expect((await archive(saved.body.id, false, 1)).body).toEqual({ error: 'edit_conflict' });
      expect((await read(saved.body.id)).body).toEqual(archived);
      const restore = await archive(saved.body.id, false, archived.editVersion);
      expect(restore.status).toBe(200);
      expect((await edit(saved.body.id, { ...input, editVersion: archived.editVersion })).body).toEqual({ error: 'edit_conflict' });
    }
  });
  it('requires current write permission for archive/restore and read permission for archived search', async () => {
    const input = { name: 'Archive protected', phone: '76112233', gender: 'male' };
    const saved = await create(input);
    for (const cookie of [reader, neither, platform]) expect((await archive(saved.body.id, true, 1, cookie)).status).toBe(403);
    expect((await archive(saved.body.id, true, 1, cookies[1])).status).toBe(404);
    expect((await archive('not-an-id', true, 1)).status).toBe(404);
    const path = `/api/clinic/patients/${saved.body.id}/archive`;
    expect((await request(app).patch(path).set('Origin', origin).send({ archived: true, editVersion: 1 })).status).toBe(401);
    expect((await request(app).patch(path).set('Cookie', writer).set('Origin', 'https://untrusted.test').send({ archived: true, editVersion: 1 })).status).toBe(403);
    for (const body of [{ archived: true }, { archived: 'true', editVersion: 1 }, { archived: true, editVersion: 0 }, { archived: true, editVersion: 2147483647 }, { archived: true, editVersion: 1, clinicId: clinics[1] }]) {
      expect((await request(app).patch(path).set('Cookie', writer).set('Origin', origin).send(body)).status).toBe(400);
    }
    expect((await archive(saved.body.id, true, 1, writer)).status).toBe(200);
    for (const cookie of [writer, neither, platform]) expect((await request(app).get('/api/clinic/patients?status=all').set('Cookie', cookie)).status).toBe(403);
    const other = await request(app).get('/api/clinic/patients?status=all&q=76112233').set('Cookie', cookies[1]);
    expect(other.body.items).toEqual([]);
    await prisma.rolePermission.deleteMany({ where: { roleId: writerRole } });
    try { expect((await archive(saved.body.id, false, 2, writer)).status).toBe(403); }
    finally { await prisma.rolePermission.create({ data: { roleId: writerRole, permissionKey: 'patients.write' } }); }
    expect((await read(saved.body.id)).body.archived).toBe(true);
    expect((await archive(saved.body.id, false, 2, writer)).status).toBe(200);
    for (const query of ['status=invalid', 'status=active&status=archived']) expect((await request(app).get(`/api/clinic/patients?${query}`).set('Cookie', reader)).status).toBe(400);
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
