import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, prisma } from '../server/app';
import { hashPassword } from '../server/password';

describe.skipIf(!process.env.TEST_DATABASE_URL)('platform management of clinic administrators',()=>{
  const prefix=`platform-admins-${crypto.randomUUID()}`, origin='http://localhost:5173';
  let platformId:string, clinicId:string, otherClinicId:string, adminId:string, employeeId:string, clinicCode:string, platformCookie:string, clinicCookie:string;
  beforeAll(async()=>{
    if(!process.env.TEST_DATABASE_URL || new URL(process.env.TEST_DATABASE_URL).pathname!=='/dentex_test' || process.env.TEST_DATABASE_URL!==process.env.DATABASE_URL) throw Error('Refusing fixtures outside dentex_test');
    process.env.JWT_SECRET='test-only-secret-with-at-least-32-characters';process.env.APP_ORIGIN=origin;
    const hash=await hashPassword('initial-test-password');
    platformId=(await prisma.platformAdmin.create({data:{username:prefix,email:`${prefix}@example.test`,passwordHash:hash}})).id;
    async function clinic(){for(let i=0;i<50;i++){const code=String(1000+Math.floor(Math.random()*8000));try{return await prisma.clinic.create({data:{name:prefix,code}})}catch(e){if((e as {code?:string}).code!=='P2002')throw e}}throw Error('No test clinic code available')}
    const first=await clinic(),second=await clinic();clinicId=first.id;otherClinicId=second.id;clinicCode=first.code;
    const adminRole=await prisma.role.create({data:{clinicId,key:'admin'}}),dentist=await prisma.role.create({data:{clinicId,key:'dentist'}});
    const admin=await prisma.user.create({data:{clinicId,name:'Admin fixture',username:`${prefix}-admin`,passwordHash:hash}});adminId=admin.id;
    const employee=await prisma.user.create({data:{clinicId,name:'Employee fixture',username:`${prefix}-employee`,passwordHash:hash}});employeeId=employee.id;
    await prisma.userRole.createMany({data:[{clinicId,userId:adminId,roleId:adminRole.id},{clinicId,userId:employeeId,roleId:dentist.id}]});
    platformCookie=(await request(app).post('/api/auth/platform/login').set('Origin',origin).send({username:prefix,password:'initial-test-password'})).headers['set-cookie'][0];
    clinicCookie=(await request(app).post('/api/auth/clinic/login').set('Origin',origin).send({code:clinicCode,username:`${prefix}-admin`,password:'initial-test-password'})).headers['set-cookie'][0];
  });
  afterAll(async()=>{for(const id of [clinicId,otherClinicId])if(id){await prisma.userRole.deleteMany({where:{clinicId:id}});await prisma.user.deleteMany({where:{clinicId:id}});await prisma.role.deleteMany({where:{clinicId:id}});await prisma.clinic.deleteMany({where:{id}})}if(platformId)await prisma.platformAdmin.deleteMany({where:{id:platformId}});await prisma.$disconnect()});
  it('lists only the selected clinic administrators without secrets',async()=>{
    const r=await request(app).get(`/api/clinics/${clinicId}/admins`).set('Cookie',platformCookie);
    expect(r.status).toBe(200);expect(r.body).toEqual([expect.objectContaining({id:adminId,name:'Admin fixture',active:true})]);expect(JSON.stringify(r.body)).not.toMatch(/password|hash/);
  });
  it('denies clinic users and unauthenticated visitors',async()=>{
    expect((await request(app).get(`/api/clinics/${clinicId}/admins`)).status).toBe(401);
    expect((await request(app).get(`/api/clinics/${clinicId}/admins`).set('Cookie',clinicCookie)).status).toBe(401);
    expect((await request(app).post(`/api/clinics/${clinicId}/admins/${adminId}/reset-password`).set('Origin',origin).set('Cookie',clinicCookie).send({password:'new-test-password'})).status).toBe(401);
  });
  it('rejects other clinics, non-administrators, malformed input and untrusted origins',async()=>{
    const reset=(clinic:string,user:string,password:unknown)=>request(app).post(`/api/clinics/${clinic}/admins/${user}/reset-password`).set('Origin',origin).set('Cookie',platformCookie).send({password});
    expect((await reset(otherClinicId,adminId,'new-test-password')).status).toBe(404);
    expect((await reset(clinicId,employeeId,'new-test-password')).status).toBe(404);
    expect((await reset(clinicId,adminId,'')).status).toBe(400);
    expect((await request(app).post(`/api/clinics/${clinicId}/admins/${adminId}/reset-password`).set('Origin','https://untrusted.example').set('Cookie',platformCookie).send({password:'new-test-password'})).status).toBe(403);
  });
  it('resets an administrator password and invalidates the old session',async()=>{
    const reset=await request(app).post(`/api/clinics/${clinicId}/admins/${adminId}/reset-password`).set('Origin',origin).set('Cookie',platformCookie).send({password:'new-test-password'});
    expect(reset.status).toBe(204);
    expect((await request(app).get('/api/auth/me').set('Cookie',clinicCookie)).status).toBe(401);
    expect((await request(app).post('/api/auth/clinic/login').set('Origin',origin).send({code:clinicCode,username:`${prefix}-admin`,password:'initial-test-password'})).status).toBe(401);
    expect((await request(app).post('/api/auth/clinic/login').set('Origin',origin).send({code:clinicCode,username:`${prefix}-admin`,password:'new-test-password'})).status).toBe(200);
  });
  it('serializes concurrent role removal and deactivation and preserves an active administrator',async()=>{
    const refreshed=await request(app).post('/api/auth/clinic/login').set('Origin',origin).send({code:clinicCode,username:`${prefix}-admin`,password:'new-test-password'});
    const firstCookie=refreshed.headers['set-cookie'][0];
    const roles=await request(app).get('/api/clinic/roles').set('Cookie',firstCookie);
    const adminRole=roles.body.find((r:{key:string})=>r.key==='admin').id, dentist=roles.body.find((r:{key:string})=>r.key==='dentist').id;
    const promote=await request(app).put(`/api/clinic/employees/${employeeId}`).set('Origin',origin).set('Cookie',firstCookie).send({editVersion: (await request(app).get(`/api/clinic/employees/${employeeId}`).set('Cookie', firstCookie)).body.editVersion ?? 1,name:'Employee fixture',username:`${prefix}-employee`,roleIds:[adminRole,dentist]});
    expect(promote.status).toBe(200);
    const secondLogin=await request(app).post('/api/auth/clinic/login').set('Origin',origin).send({code:clinicCode,username:`${prefix}-employee`,password:'initial-test-password'});
    const secondCookie=secondLogin.headers['set-cookie'][0];
    const [demote,disable]=await Promise.all([
      request(app).put(`/api/clinic/employees/${adminId}`).set('Origin',origin).set('Cookie',secondCookie).send({editVersion: (await request(app).get(`/api/clinic/employees/${adminId}`).set('Cookie', firstCookie)).body.editVersion ?? 1,name:'Admin fixture',username:`${prefix}-admin`,roleIds:[dentist]}),
      request(app).patch(`/api/clinic/employees/${employeeId}/status`).set('Origin',origin).set('Cookie',firstCookie).send({active:false})
    ]);
    // A deactivated actor can be rejected during authentication, before the
    // transaction's authorization check; both timings must preserve one admin.
    expect([[200,401],[200,403]]).toContainEqual([demote.status,disable.status].sort());
    const rejected=demote.status===200?disable:demote;
    expect(rejected.body.error).toBe(rejected.status===401?'unauthorized':'forbidden');
    const survivor=demote.status===200?secondCookie:firstCookie;
    const list=await request(app).get(`/api/clinic/employees`).set('Cookie',survivor);
    expect(list.status).toBe(200);
    expect(list.body.filter((u:{active:boolean;roles:{key:string}[]})=>u.active&&u.roles.some(r=>r.key==='admin'))).toHaveLength(1);
  });
});
