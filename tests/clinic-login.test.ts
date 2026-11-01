import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app, prisma } from '../server/app';
import { hashPassword } from '../server/password';

describe.skipIf(!process.env.TEST_DATABASE_URL)('clinic sign in and isolation', () => {
  const origin = 'http://localhost:5173';
  const testName = `login-${crypto.randomUUID()}`;
  const username = testName;
  let codes:string[], ids:string[], userIds:string[], cookie:string;
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || new URL(process.env.TEST_DATABASE_URL).pathname !== '/dentex_test' || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error('Refusing fixtures outside dentex_test');
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    process.env.APP_ORIGIN = origin;
    const used = new Set((await prisma.clinic.findMany({select:{code:true}})).map(c => c.code));
    codes = Array.from({length:10000}, (_, i) => String(i).padStart(4,'0')).filter(c => !used.has(c)).slice(0,2);
    if(codes.length<2) throw Error('Insufficient test clinic codes');
    const hash = await hashPassword('test-password');
    const a = await prisma.clinic.create({data:{name:testName+' A', code:codes[0]}});
    const b = await prisma.clinic.create({data:{name:testName+' B', code:codes[1]}});
    ids=[a.id,b.id]; userIds=[];
    for (const id of ids) {
      const role = await prisma.role.create({data:{clinicId:id,key:'admin'}});
      const user = await prisma.user.create({data:{clinicId:id,name:testName,username,passwordHash:hash}});
      await prisma.userRole.create({data:{clinicId:id,userId:user.id,roleId:role.id}}); userIds.push(user.id);
    }
  });
  afterAll(async () => {
    for (const id of ids ?? []) { await prisma.userRole.deleteMany({where:{clinicId:id}}); await prisma.user.deleteMany({where:{clinicId:id}}); await prisma.role.deleteMany({where:{clinicId:id}}); await prisma.clinic.deleteMany({where:{id}}); }
    await prisma.$disconnect();
  });
  it('signs into its clinic and returns only current identity without secrets', async () => {
    const r=await request(app).post('/api/auth/clinic/login').set('Origin',origin).send({code:codes[0],username,password:'test-password'});
    expect(r.status).toBe(200); cookie=r.headers['set-cookie'][0];
    expect(cookie).toMatch(/HttpOnly/); expect(cookie).toMatch(/Secure/); expect(cookie).toMatch(/SameSite=Strict/);
    expect(r.body).toMatchObject({kind:'clinic',username,clinic:{id:ids[0],code:codes[0]},roles:['admin']});
    expect(JSON.stringify(r.body)).not.toContain('password');
    const me=await request(app).get(`/api/auth/me?clinicId=${ids[1]}`).set('Cookie',cookie);
    expect(me.body.clinic.id).toBe(ids[0]);
  });
  it('rejects wrong credentials uniformly and cannot use a clinic session for platform APIs', async () => {
    const bad=await request(app).post('/api/auth/clinic/login').set('Origin',origin).send({code:codes[0],username,password:'wrong'});
    expect(bad.status).toBe(401); expect(bad.body).toEqual({error:'invalid_credentials'});
    const missing=await request(app).post('/api/auth/clinic/login').set('Origin',origin).send({code:codes[0],username:'missing-user',password:'wrong'});
    expect(missing.status).toBe(401); expect(missing.body).toEqual(bad.body);
    expect((await request(app).get('/api/clinics').set('Cookie',cookie)).status).toBe(401);
    expect((await request(app).post('/api/clinics').set('Origin',origin).set('Cookie',cookie).send({})).status).toBe(401);
  });
  it('reads role changes on the next authenticated request', async () => {
    const secondRole=await prisma.role.create({data:{clinicId:ids[0],key:'dentist'}});
    await prisma.userRole.create({data:{clinicId:ids[0],userId:userIds[0],roleId:secondRole.id}});
    const me=await request(app).get('/api/auth/me').set('Cookie',cookie);
    expect(me.body.roles).toEqual(['admin','dentist']);
  });
  it('rejects expired and revoked tokens and reflects account state on the next request', async () => {
    const expired = jwt.sign({kind:'clinic',version:1},process.env.JWT_SECRET!,{subject:userIds[0],expiresIn:-1});
    expect((await request(app).get('/api/auth/me').set('Cookie',`dentex_session=${expired}`)).status).toBe(401);
    await prisma.user.update({where:{id:userIds[0]},data:{active:false,credentialVersion:{increment:1}}});
    expect((await request(app).get('/api/auth/me').set('Cookie',cookie)).status).toBe(401);
    await prisma.user.update({where:{id:userIds[0]},data:{active:true}});
    expect((await request(app).get('/api/auth/me').set('Cookie',cookie)).status).toBe(401);
  });
  it('rejects untrusted origins and clears the current session on logout', async () => {
    expect((await request(app).post('/api/auth/clinic/login').set('Origin','https://attacker.example').send({code:codes[1],username,password:'test-password'})).status).toBe(403);
    const login=await request(app).post('/api/auth/clinic/login').set('Origin',origin).send({code:codes[1],username,password:'test-password'});
    const session=login.headers['set-cookie'][0];
    const out=await request(app).post('/api/auth/logout').set('Origin',origin).set('Cookie',session);
    expect(out.status).toBe(204); expect(out.headers['set-cookie'][0]).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
  it('limits repeated login attempts', async () => {
    let last=0;
    for (let i=0;i<12;i++) last=(await request(app).post('/api/auth/clinic/login').set('Origin',origin).send({code:codes[1],username:'missing-user',password:'wrong'})).status;
    expect(last).toBe(429);
  });

});
