import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, prisma } from '../server/app';
import { hashPassword } from '../server/password';

describe.skipIf(!process.env.TEST_DATABASE_URL)('managing clinic employees', () => {
  const origin='http://localhost:5173', prefix=`employee-${crypto.randomUUID()}`;
  let codes:string[], ids:string[], adminIds:string[], roleIds:Record<string,string>[], cookies:string[], createdId:string;
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || new URL(process.env.TEST_DATABASE_URL).pathname !== '/dentex_test' || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error('Refusing fixtures outside dentex_test');
    process.env.JWT_SECRET='test-only-secret-with-at-least-32-characters'; process.env.APP_ORIGIN=origin;
    const used=new Set((await prisma.clinic.findMany({select:{code:true}})).map(c=>c.code));
    codes=Array.from({length:10000},(_,i)=>String(9999-i).padStart(4,'0')).filter(c=>!used.has(c)).slice(0,2);
    ids=[]; adminIds=[]; roleIds=[]; cookies=[]; const passwordHash=await hashPassword('test-password');
    for (let i=0;i<2;i++) {
      const clinic=await prisma.clinic.create({data:{name:`${prefix}-${i}`,code:codes[i]}}); ids.push(clinic.id);
      const map:Record<string,string>={};
      for (const key of ['admin','dentist','receptionist']) { const role=await prisma.role.create({data:{clinicId:clinic.id,key}}); map[key]=role.id; } roleIds.push(map);
      const user=await prisma.user.create({data:{clinicId:clinic.id,name:`Admin ${i}`,username:`${prefix}-${i}`,passwordHash}}); adminIds.push(user.id);
      await prisma.userRole.create({data:{clinicId:clinic.id,userId:user.id,roleId:map.admin}});
      const login=await request(app).post('/api/auth/clinic/login').set('Origin',origin).send({code:codes[i],username:`${prefix}-${i}`,password:'test-password'}); cookies.push(login.headers['set-cookie'][0]);
    }
  });
  afterAll(async()=>{ for(const id of ids??[]){ await prisma.userRole.deleteMany({where:{clinicId:id}}); await prisma.user.deleteMany({where:{clinicId:id}}); await prisma.role.deleteMany({where:{clinicId:id}}); await prisma.clinic.deleteMany({where:{id}}); } await prisma.$disconnect(); });
  it('creates an employee and lists only its own clinic without secrets', async () => {
    const r=await request(app).post('/api/clinic/employees').set('Origin',origin).set('Cookie',cookies[0]).send({name:'Employee',username:'shared',password:'test-password',roleIds:[roleIds[0].dentist]});
    expect(r.status).toBe(201); createdId=r.body.id;
    const list=await request(app).get('/api/clinic/employees').set('Cookie',cookies[0]);
    expect(list.body).toContainEqual(expect.objectContaining({id:createdId,name:'Employee',username:'shared',active:true}));
    expect(JSON.stringify(list.body)).not.toContain('password');
    const other=await request(app).get('/api/clinic/employees').set('Cookie',cookies[1]);
    expect(other.body).not.toContainEqual(expect.objectContaining({id:createdId}));
  });
  it('rejects simultaneous edits from the same version without replacing the winning roles or name', async () => {
    const base=await request(app).get(`/api/clinic/employees/${createdId}`).set('Cookie',cookies[0]);
    expect(base.body.editVersion).toBe(1);
    const writes=await Promise.all(['First','Second'].map((name,i)=>request(app).put(`/api/clinic/employees/${createdId}`).set('Origin',origin).set('Cookie',cookies[0]).send({editVersion:base.body.editVersion,name,username:'shared',roleIds:[i ? roleIds[0].receptionist : roleIds[0].dentist]})));
    expect(writes.map(r=>r.status).sort()).toEqual([200,409]);
    expect(writes.find(r=>r.status===409)!.body.error).toBe('edit_conflict');
    const current=await request(app).get(`/api/clinic/employees/${createdId}`).set('Cookie',cookies[0]);
    expect(current.body).toEqual(writes.find(r=>r.status===200)!.body);
    expect(current.body.editVersion).toBe(2);
  });
  it('enforces scoped usernames and role assignment, and the new employee can log in', async () => {
    const payload={name:'Employee',username:'shared',password:'test-password',roleIds:[roleIds[0].dentist]};
    expect((await request(app).post('/api/clinic/employees').set('Origin',origin).set('Cookie',cookies[0]).send(payload)).status).toBe(409);
    const foreign=await request(app).post('/api/clinic/employees').set('Origin',origin).set('Cookie',cookies[0]).send({...payload,username:'another',roleIds:[roleIds[1].dentist]});
    expect(foreign.status).toBe(400);
    const other=await request(app).post('/api/clinic/employees').set('Origin',origin).set('Cookie',cookies[1]).send({...payload,roleIds:[roleIds[1].dentist]});
    expect(other.status).toBe(201);
    const login=await request(app).post('/api/auth/clinic/login').set('Origin',origin).send({code:codes[0],username:'shared',password:'test-password'});
    expect(login.status).toBe(200);
    expect((await request(app).get('/api/clinic/employees').set('Cookie',login.headers['set-cookie'][0])).status).toBe(403);
    const cross=await request(app).put(`/api/clinic/employees/${other.body.id}`).set('Origin',origin).set('Cookie',cookies[0]).send({editVersion: (await request(app).get(`/api/clinic/employees/${other.body.id}`).set('Cookie', cookies[0])).body.editVersion ?? 1,name:'Wrong',username:'shared',roleIds:[roleIds[0].dentist]});
    expect(cross.status).toBe(404);
  });
  it('requires a valid editing version and keeps password/status lifecycles independent', async () => {
    const url=`/api/clinic/employees/${createdId}`;
    const read=()=>request(app).get(url).set('Cookie',cookies[0]);
    const base=await read();
    for (const version of [undefined,0,-1,1.5,'1',null,2147483647]) {
      const result=await request(app).put(url).set('Origin',origin).set('Cookie',cookies[0]).send({name:'Invalid',username:'invalid',roleIds:[roleIds[0].dentist],editVersion:version});
      expect(result.status).toBe(400); expect(result.body.error).toBe('invalid_input');
    }
    expect((await read()).body).toEqual(base.body);
    await request(app).patch(url+'/status').set('Origin',origin).set('Cookie',cookies[0]).send({active:false}).expect(200);
    await request(app).post(url+'/reset-password').set('Origin',origin).set('Cookie',cookies[0]).send({password:'test-password'}).expect(204);
    expect((await read()).body.editVersion).toBe(base.body.editVersion);
    await request(app).patch(url+'/status').set('Origin',origin).set('Cookie',cookies[0]).send({active:true}).expect(200);
  });
  it('edits employee data and roles, and prevents removal of the last administrator', async () => {
    const edit=await request(app).put(`/api/clinic/employees/${createdId}`).set('Origin',origin).set('Cookie',cookies[0]).send({editVersion: (await request(app).get(`/api/clinic/employees/${createdId}`).set('Cookie', cookies[0])).body.editVersion ?? 1,name:'Updated employee',username:'new-shared',roleIds:[roleIds[0].dentist,roleIds[0].receptionist]});
    expect(edit.status).toBe(200); expect(edit.body).toMatchObject({name:'Updated employee',username:'new-shared'});
    expect(edit.body.roles.map((r:{key:string})=>r.key)).toEqual(['dentist','receptionist']);
    const denied=await request(app).put(`/api/clinic/employees/${adminIds[0]}`).set('Origin',origin).set('Cookie',cookies[0]).send({editVersion: (await request(app).get(`/api/clinic/employees/${adminIds[0]}`).set('Cookie', cookies[0])).body.editVersion ?? 1,name:'Admin 0',username:`${prefix}-0`,roleIds:[roleIds[0].dentist]});
    expect(denied.status).toBe(409); expect(denied.body.error).toBe('last_admin');
  });
  it('serializes simultaneous administrator role removals', async () => {
    const promotion=await request(app).put(`/api/clinic/employees/${createdId}`).set('Origin',origin).set('Cookie',cookies[0]).send({editVersion: (await request(app).get(`/api/clinic/employees/${createdId}`).set('Cookie', cookies[0])).body.editVersion ?? 1,name:'Updated employee',username:'new-shared',roleIds:[roleIds[0].admin,roleIds[0].dentist]});
    expect(promotion.status).toBe(200);
    const login=await request(app).post('/api/auth/clinic/login').set('Origin',origin).send({code:codes[0],username:'new-shared',password:'test-password'});
    const employeeCookie=login.headers['set-cookie'][0];
    const [a,b]=await Promise.all([
      request(app).put(`/api/clinic/employees/${adminIds[0]}`).set('Origin',origin).set('Cookie',employeeCookie).send({editVersion: (await request(app).get(`/api/clinic/employees/${adminIds[0]}`).set('Cookie', cookies[0])).body.editVersion ?? 1,name:'Admin 0',username:`${prefix}-0`,roleIds:[roleIds[0].dentist]}),
      request(app).put(`/api/clinic/employees/${createdId}`).set('Origin',origin).set('Cookie',cookies[0]).send({editVersion: (await request(app).get(`/api/clinic/employees/${createdId}`).set('Cookie', cookies[0])).body.editVersion ?? 1,name:'Updated employee',username:'new-shared',roleIds:[roleIds[0].dentist]})
    ]);
    expect([a.status,b.status].sort()).toEqual([200,403]);
    const survivor=a.status===200 ? employeeCookie : cookies[0];
    const list=await request(app).get('/api/clinic/employees').set('Cookie',survivor);
    expect(list.body.filter((e:{active:boolean;roles:{key:string}[]})=>e.active&&e.roles.some(r=>r.key==='admin'))).toHaveLength(1);
  });

});
