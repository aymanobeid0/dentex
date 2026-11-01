import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, prisma } from '../server/app';
import { hashPassword } from '../server/password';

describe('platform administration', () => {
  it('does not expose clinics to anonymous visitors', async () => {
    const response = await request(app).get('/api/clinics');
    expect(response.status).toBe(401);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)('platform administration with an isolated database', () => {
  const username = `test-${crypto.randomUUID()}`;
  const code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  const origin = 'http://localhost:5173';
  let cookie: string;
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || new URL(process.env.TEST_DATABASE_URL).pathname !== '/dentex_test' || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error('Refusing to run fixtures outside dentex_test');
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    process.env.APP_ORIGIN = origin;
    await prisma.platformAdmin.create({ data: { username, email: `${username}@example.test`, passwordHash: await hashPassword('test-password') } });
    await prisma.clinic.create({ data: { name: username, code } });
  });
  afterAll(async () => { await prisma.clinic.deleteMany({ where: { name: username } }); await prisma.platformAdmin.deleteMany({ where: { username } }); await prisma.$disconnect(); });
  it('rejects invalid credentials without identifying the invalid field', async () => {
    const response = await request(app).post('/api/auth/platform/login').set('Origin', origin).send({ username, password: 'wrong' });
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'invalid_credentials' });
  });
  it('signs in, protects the session cookie, and lists clinics', async () => {
    const login = await request(app).post('/api/auth/platform/login').set('Origin', origin).send({ username, password: 'test-password' });
    expect(login.status).toBe(200);
    cookie = login.headers['set-cookie'][0];
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).not.toMatch(/Expires=|Max-Age=/);
    const response = await request(app).get('/api/clinics').set('Cookie', cookie);
    expect(response.body).toContainEqual(expect.objectContaining({ name: username, code }));
  });
  it('rejects requests from an untrusted origin', async () => {
    const response = await request(app).post('/api/auth/logout').set('Origin', 'https://attacker.example').set('Cookie', cookie);
    expect(response.status).toBe(403);
  });
  it('clears the current browser session on logout', async () => {
    const response = await request(app).post('/api/auth/logout').set('Origin', origin).set('Cookie', cookie);
    expect(response.status).toBe(204);
    expect(response.headers['set-cookie'][0]).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});
