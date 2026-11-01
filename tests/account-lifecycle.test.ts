import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, prisma } from '../server/app';
import { hashPassword } from '../server/password';

describe.skipIf(!process.env.TEST_DATABASE_URL)('clinic account lifecycle', () => {
  const origin='http://localhost:5173', prefix=`lifecycle-${crypto.randomUUID()}`;
  let clinicId:string, code:string, adminId:string, employeeId:string, adminRoleId:string, adminCookie:string, employeeCookie:string;
  const login=(username:string,password:string)=>request(app).post('/api/auth/clinic/login').set('Origin',origin).send({code,username,password});
  beforeAll(async()=>{
    if(!process.env.TEST_DATABASE_URL || new URL(process.env.TEST_DATABASE_URL).pathname!=='/dentex_test' || process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL) throw Error('Refusing fixtures outside dentex_test');
    process.env.JWT_SECRET='test-only-secret-with-at-least-32-characters'; process.env.APP_ORIGIN=origin;
    for(let attempt=0;attempt<50&&!clinicId;attempt++) {
      code=String(1000+Math.floor(Math.random()*8000));
      try { clinicId=(await prisma.clinic.create({data:{name:prefix,code}})).id; } catch(e) { if((e as {code?:string}).code!=='P2002') throw e; }
    }
    if(!clinicId) throw Error('No test clinic code available');
    const adminRole=await prisma.role.create({data:{clinicId,key:'admin'}});
    adminRoleId=adminRole.id;
    const dentist=await prisma.role.create({data:{clinicId,key:'dentist'}});
    const hash=await hashPassword('initial-test-password');
    const admin=await prisma.user.create({data:{clinicId,name:'Manager',username:`${prefix}-admin`,passwordHash:hash}}); adminId=admin.id;
    const employee=await prisma.user.create({data:{clinicId,name:'Employee',username:`${prefix}-employee`,passwordHash:hash}}); employeeId=employee.id;
    await prisma.userRole.createMany({data:[{clinicId,userId:adminId,roleId:adminRole.id},{clinicId,userId:employeeId,roleId:dentist.id}]});
    adminCookie=(await login(`${prefix}-admin`,'initial-test-password')).headers['set-cookie'][0];
    employeeCookie=(await login(`${prefix}-employee`,'initial-test-password')).headers['set-cookie'][0];
  });
  afterAll(async()=>{if(clinicId){await prisma.userRole.deleteMany({where:{clinicId}});await prisma.user.deleteMany({where:{clinicId}});await prisma.role.deleteMany({where:{clinicId}});await prisma.clinic.deleteMany({where:{id:clinicId}});}await prisma.$disconnect();});
  it('prevents deactivating the last active administrator',async()=>{
    const r=await request(app).patch(`/api/clinic/employees/${adminId}/status`).set('Origin',origin).set('Cookie',adminCookie).send({active:false});
    expect(r.status).toBe(409); expect(r.body.error).toBe('last_admin');
  });
  it('disables and re-enables an employee while permanently invalidating the old token',async()=>{
    const disable=await request(app).patch(`/api/clinic/employees/${employeeId}/status`).set('Origin',origin).set('Cookie',adminCookie).send({active:false});
    expect(disable.status).toBe(200); expect(disable.body.active).toBe(false);
    expect((await request(app).get('/api/auth/me').set('Cookie',employeeCookie)).status).toBe(401);
    expect((await login(`${prefix}-employee`,'initial-test-password')).status).toBe(401);
    expect((await request(app).patch(`/api/clinic/employees/${employeeId}/status`).set('Origin',origin).set('Cookie',adminCookie).send({active:true})).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Cookie',employeeCookie)).status).toBe(401);
    const again=await login(`${prefix}-employee`,'initial-test-password'); expect(again.status).toBe(200); employeeCookie=again.headers['set-cookie'][0];
  });
  it('resets a password and immediately revokes existing sessions',async()=>{
    const reset=await request(app).post(`/api/clinic/employees/${employeeId}/reset-password`).set('Origin',origin).set('Cookie',adminCookie).send({password:'reset-test-password'});
    expect(reset.status).toBe(204);
    expect((await request(app).get('/api/auth/me').set('Cookie',employeeCookie)).status).toBe(401);
    expect((await login(`${prefix}-employee`,'initial-test-password')).status).toBe(401);
    const next=await login(`${prefix}-employee`,'reset-test-password'); expect(next.status).toBe(200); employeeCookie=next.headers['set-cookie'][0];
  });
  it('requires the current password and revokes the session when changing it',async()=>{
    const change=(currentPassword:string)=>request(app).post('/api/clinic/account/password').set('Origin',origin).set('Cookie',employeeCookie).send({currentPassword,newPassword:'changed-test-password'});
    expect((await change('wrong')).body.error).toBe('incorrect_password');
    expect((await change('reset-test-password')).status).toBe(204);
    expect((await request(app).get('/api/auth/me').set('Cookie',employeeCookie)).status).toBe(401);
    expect((await login(`${prefix}-employee`,'changed-test-password')).status).toBe(200);
  });
  it('rejects account management by an employee without permission',async()=>{
    const fresh=await login(`${prefix}-employee`,'changed-test-password');
    const r=await request(app).patch(`/api/clinic/employees/${adminId}/status`).set('Origin',origin).set('Cookie',fresh.headers['set-cookie'][0]).send({active:false});
    expect(r.status).toBe(403);
  });
  it('does not allow management of a user from another clinic',async()=>{
    let foreignId='';
    try {
      for(let n=0;n<50&&!foreignId;n++) {
        const foreignCode=String(1000+Math.floor(Math.random()*8000));
        try { foreignId=(await prisma.clinic.create({data:{name:`${prefix}-foreign`,code:foreignCode}})).id; } catch(e){if((e as {code?:string}).code!=='P2002') throw e;}
      }
      if(!foreignId) throw Error('No test clinic code available');
      const foreign=await prisma.user.create({data:{clinicId:foreignId,name:'Foreign',username:'foreign',passwordHash:await hashPassword('foreign-password')}});
      const status=await request(app).patch(`/api/clinic/employees/${foreign.id}/status`).set('Origin',origin).set('Cookie',adminCookie).send({active:false});
      const reset=await request(app).post(`/api/clinic/employees/${foreign.id}/reset-password`).set('Origin',origin).set('Cookie',adminCookie).send({password:'another-password'});
      expect(status.status).toBe(404); expect(reset.status).toBe(404);
    } finally {if(foreignId){await prisma.user.deleteMany({where:{clinicId:foreignId}});await prisma.clinic.deleteMany({where:{id:foreignId}})}}
  });
  it('serializes simultaneous attempts to disable both active administrators',async()=>{
    const second=await prisma.user.create({data:{clinicId,name:'Second',username:`${prefix}-second`,passwordHash:await hashPassword('second-test-password')}});
    await prisma.userRole.create({data:{clinicId,userId:second.id,roleId:adminRoleId}});
    const secondLogin=await login(`${prefix}-second`,'second-test-password'); const secondCookie=secondLogin.headers['set-cookie'][0];
    const [a,b]=await Promise.all([
      request(app).patch(`/api/clinic/employees/${adminId}/status`).set('Origin',origin).set('Cookie',secondCookie).send({active:false}),
      request(app).patch(`/api/clinic/employees/${second.id}/status`).set('Origin',origin).set('Cookie',adminCookie).send({active:false})
    ]);
    expect([a.status,b.status].sort()).toEqual([200,403]);
  });
});
