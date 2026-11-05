import { describe,it,expect,beforeAll,afterAll } from 'vitest';
import request from 'supertest';
import { app,prisma } from '../server/app';
import { hashPassword } from '../server/password';

describe.skipIf(!process.env.TEST_DATABASE_URL)('clinic role permissions',()=>{
  const origin='http://localhost:5173', prefix=`roles-${crypto.randomUUID()}`;
  let ids:string[]=[], codes:string[]=[], cookies:string[]=[], roles:{id:string;key:string;permissions:string[]}[][]=[];
  beforeAll(async()=>{
    if(!process.env.TEST_DATABASE_URL || new URL(process.env.TEST_DATABASE_URL).pathname!=='/dentex_test' || process.env.DATABASE_URL!==process.env.TEST_DATABASE_URL) throw Error('Refusing fixtures outside dentex_test');
    process.env.JWT_SECRET='test-only-secret-with-at-least-32-characters'; process.env.APP_ORIGIN=origin;
    const used=new Set((await prisma.clinic.findMany({select:{code:true}})).map(c=>c.code));
    codes=Array.from({length:10000},(_,i)=>String((i+5000)%10000).padStart(4,'0')).filter(c=>!used.has(c)).slice(0,2);
    await prisma.platformAdmin.create({data:{username:prefix,email:`${prefix}@example.test`,passwordHash:await hashPassword('test-password')}});
    const plogin=await request(app).post('/api/auth/platform/login').set('Origin',origin).send({username:prefix,password:'test-password'});
    const platformCookie=plogin.headers['set-cookie'][0];
    for(let i=0;i<2;i++){
      const created=await request(app).post('/api/clinics').set('Origin',origin).set('Cookie',platformCookie).send({name:`${prefix}-${i}`,code:codes[i],managerName:'Admin',managerUsername:prefix,managerPassword:'test-password'});
      expect(created.status).toBe(201);ids.push(created.body.id);
      const login=await request(app).post('/api/auth/clinic/login').set('Origin',origin).send({code:codes[i],username:prefix,password:'test-password'});cookies.push(login.headers['set-cookie'][0]);
    }
  });
  afterAll(async()=>{for(const id of ids){await prisma.patient.deleteMany({where:{clinicId:id}});await prisma.userRole.deleteMany({where:{clinicId:id}});await prisma.user.deleteMany({where:{clinicId:id}});await prisma.rolePermission.deleteMany({where:{role:{clinicId:id}}});await prisma.role.deleteMany({where:{clinicId:id}});await prisma.clinic.deleteMany({where:{id}})}await prisma.platformAdmin.deleteMany({where:{username:prefix}});await prisma.$disconnect()});
  it('shows independent initial roles and financial read access for dentists',async()=>{
    for(let i=0;i<2;i++){const r=await request(app).get('/api/clinic/role-permissions').set('Cookie',cookies[i]);expect(r.status).toBe(200);roles.push(r.body.roles);}
    const dentist=roles[0].find(r=>r.key==='dentist')!;
    expect(dentist.permissions).toContain('patient_financial.read');
    expect(dentist.permissions).not.toContain('payments.write');
    expect(roles[0].find(r=>r.key==='admin')!.permissions).toContain('employees.manage');
  });
  it('rejects simultaneous grant replacements based on the same editing version', async()=>{
    const initial=await request(app).get('/api/clinic/role-permissions').set('Cookie',cookies[0]);
    const role=initial.body.roles.find((r:{key:string})=>r.key==='receptionist');
    expect(role.editVersion).toBe(1);
    const results=await Promise.all([['patients.read'],['patients.write']].map(permissions=>request(app).put(`/api/clinic/role-permissions/${role.id}`).set('Origin',origin).set('Cookie',cookies[0]).send({permissions,editVersion:role.editVersion})));
    expect(results.map(r=>r.status).sort()).toEqual([200,409]);
    expect(results.find(r=>r.status===409)!.body.error).toBe('edit_conflict');
    const latest=await request(app).get('/api/clinic/role-permissions').set('Cookie',cookies[0]);
    expect(latest.body.roles.find((r:{id:string})=>r.id===role.id)).toEqual(results.find(r=>r.status===200)!.body);
    await request(app).put(`/api/clinic/role-permissions/${role.id}`).set('Origin',origin).set('Cookie',cookies[0]).send({permissions:role.permissions,editVersion:2}).expect(200);
  });
  it('rejects absent or invalid grant versions without changing the grant set', async()=>{
    const read=()=>request(app).get('/api/clinic/role-permissions').set('Cookie',cookies[0]);
    const initial=await read(),role=initial.body.roles.find((r:{key:string})=>r.key==='dentist');
    for(const editVersion of [undefined,0,-1,1.5,'1',null,2147483647]) {
      const result=await request(app).put(`/api/clinic/role-permissions/${role.id}`).set('Origin',origin).set('Cookie',cookies[0]).send({editVersion,permissions:[]});
      expect(result.status).toBe(400);expect(result.body.error).toBe('invalid_permissions');
    }
    expect((await read()).body).toEqual(initial.body);
  });
  it('lets a default dentist register and read a patient while keeping the grant revocable and clinic-scoped', async () => {
    const dentist = roles[0].find(role => role.key === 'dentist')!;
    const created = await request(app).post('/api/clinic/employees').set('Origin', origin).set('Cookie', cookies[0]).send({ name: 'Default dentist', username: 'default-dentist', password: 'test-password', roleIds: [dentist.id] });
    expect(created.status).toBe(201);
    const login = await request(app).post('/api/auth/clinic/login').set('Origin', origin).send({ code: codes[0], username: 'default-dentist', password: 'test-password' });
    expect(login.status).toBe(200);
    const cookie = login.headers['set-cookie'][0];
    const payload = { name: 'Dentist registered patient', phone: '71112233', gender: 'male' };
    try {
      const patient = await request(app).post('/api/clinic/patients').set('Origin', origin).set('Cookie', cookie).send(payload);
      expect(patient.status).toBe(201);
      const file = await request(app).get(`/api/clinic/patients/${patient.body.id}`).set('Cookie', cookie);
      expect(file.status).toBe(200); expect(file.body.name).toBe(payload.name);
      expect((await request(app).get(`/api/clinic/patients/${patient.body.id}`).set('Cookie', cookies[1])).status).toBe(404);
      const revoke = await request(app).put(`/api/clinic/role-permissions/${dentist.id}`).set('Origin', origin).set('Cookie', cookies[0]).send({editVersion:(await request(app).get('/api/clinic/role-permissions').set('Cookie',cookies[0])).body.roles.find((r:{id:string;editVersion:number})=>r.id===dentist.id)?.editVersion ?? 1, permissions: dentist.permissions.filter(key => key !== 'patients.write') });
      expect(revoke.status).toBe(200);
      expect((await request(app).post('/api/clinic/patients').set('Origin', origin).set('Cookie', cookie).send({ ...payload, isChild: true })).status).toBe(403);
      const other = await request(app).get('/api/clinic/role-permissions').set('Cookie', cookies[1]);
      expect(other.body.roles.find((role: { key: string }) => role.key === 'dentist').permissions).toContain('patients.write');
    } finally {
      expect((await request(app).put(`/api/clinic/role-permissions/${dentist.id}`).set('Origin', origin).set('Cookie', cookies[0]).send({editVersion:(await request(app).get('/api/clinic/role-permissions').set('Cookie',cookies[0])).body.roles.find((r:{id:string;editVersion:number})=>r.id===dentist.id)?.editVersion ?? 1, permissions: dentist.permissions })).status).toBe(200);
    }
  });
  it('protects the admin role and scopes role updates to the authenticated clinic',async()=>{
    const admin=roles[0].find(r=>r.key==='admin')!, foreign=roles[1].find(r=>r.key==='dentist')!;
    expect((await request(app).put(`/api/clinic/role-permissions/${admin.id}`).set('Origin',origin).set('Cookie',cookies[0]).send({editVersion:(await request(app).get('/api/clinic/role-permissions').set('Cookie',cookies[0])).body.roles.find((r:{id:string;editVersion:number})=>r.id===admin.id)?.editVersion ?? 1,permissions:[]})).status).toBe(403);
    expect((await request(app).put(`/api/clinic/role-permissions/${foreign.id}`).set('Origin',origin).set('Cookie',cookies[0]).send({editVersion:(await request(app).get('/api/clinic/role-permissions').set('Cookie',cookies[0])).body.roles.find((r:{id:string;editVersion:number})=>r.id===foreign.id)?.editVersion ?? 1,permissions:[]})).status).toBe(404);
    const invalid=await request(app).put(`/api/clinic/role-permissions/${roles[0].find(r=>r.key==='dentist')!.id}`).set('Origin',origin).set('Cookie',cookies[0]).send({editVersion:(await request(app).get('/api/clinic/role-permissions').set('Cookie',cookies[0])).body.roles.find((r:{id:string;editVersion:number})=>r.id===roles[0].find(r=>r.key==='dentist')!.id)?.editVersion ?? 1,permissions:['unknown.permission']});expect(invalid.status).toBe(400);
    const me=await request(app).get('/api/auth/me').set('Cookie',cookies[0]);expect(me.body.permissions).toContain('employees.manage');expect(me.body.permissions).toContain('payments.write');
  });
  it('unions roles and applies grant and removal on the next request only in the edited clinic',async()=>{
    const dentist=roles[0].find(r=>r.key==='dentist')!, reception=roles[0].find(r=>r.key==='receptionist')!;
    const created=await request(app).post('/api/clinic/employees').set('Origin',origin).set('Cookie',cookies[0]).send({name:'Combined',username:'combined',password:'test-password',roleIds:[dentist.id,reception.id]});expect(created.status).toBe(201);
    const login=await request(app).post('/api/auth/clinic/login').set('Origin',origin).send({code:codes[0],username:'combined',password:'test-password'});
    const employeeCookie=login.headers['set-cookie'][0];
    let me=await request(app).get('/api/auth/me').set('Cookie',employeeCookie);
    expect(me.body.permissions).toContain('patient_records.write');expect(me.body.permissions).toContain('communications.write');
    expect((await request(app).get('/api/clinic/employees').set('Cookie',employeeCookie)).status).toBe(403);
    expect((await request(app).put(`/api/clinic/role-permissions/${dentist.id}`).set('Origin',origin).set('Cookie',cookies[0]).send({editVersion:(await request(app).get('/api/clinic/role-permissions').set('Cookie',cookies[0])).body.roles.find((r:{id:string;editVersion:number})=>r.id===dentist.id)?.editVersion ?? 1,permissions:['employees.manage']})).status).toBe(200);
    expect((await request(app).get('/api/clinic/employees').set('Cookie',employeeCookie)).status).toBe(200);
    me=await request(app).get('/api/auth/me').set('Cookie',employeeCookie);expect(me.body.permissions).toContain('employees.manage');expect(me.body.permissions).toContain('communications.write');expect(me.body.permissions).not.toContain('patient_records.write');
    const other=await request(app).get('/api/clinic/role-permissions').set('Cookie',cookies[1]);expect(other.body.roles.find((r:{key:string})=>r.key==='dentist').permissions).toContain('patient_records.write');
    expect((await request(app).put(`/api/clinic/role-permissions/${dentist.id}`).set('Origin',origin).set('Cookie',cookies[0]).send({editVersion:(await request(app).get('/api/clinic/role-permissions').set('Cookie',cookies[0])).body.roles.find((r:{id:string;editVersion:number})=>r.id===dentist.id)?.editVersion ?? 1,permissions:[]})).status).toBe(200);
    expect((await request(app).get('/api/clinic/employees').set('Cookie',employeeCookie)).status).toBe(403);
    expect((await request(app).get('/api/clinic/role-permissions').set('Cookie',employeeCookie)).status).toBe(403);
  });

  it('does not allow delegated employee managers to obtain or control administrator access',async()=>{
    const dentist=roles[0].find(r=>r.key==='dentist')!, admin=roles[0].find(r=>r.key==='admin')!;
    const grant=await request(app).put(`/api/clinic/role-permissions/${dentist.id}`).set('Origin',origin).set('Cookie',cookies[0]).send({editVersion:(await request(app).get('/api/clinic/role-permissions').set('Cookie',cookies[0])).body.roles.find((r:{id:string;editVersion:number})=>r.id===dentist.id)?.editVersion ?? 1,permissions:['employees.manage']});expect(grant.status).toBe(200);
    const created=await request(app).post('/api/clinic/employees').set('Origin',origin).set('Cookie',cookies[0]).send({name:'Delegate',username:'delegate',password:'test-password',roleIds:[dentist.id]});expect(created.status).toBe(201);
    const login=await request(app).post('/api/auth/clinic/login').set('Origin',origin).send({code:codes[0],username:'delegate',password:'test-password'});const delegate=login.headers['set-cookie'][0];
    const escalate=await request(app).put(`/api/clinic/employees/${created.body.id}`).set('Origin',origin).set('Cookie',delegate).send({editVersion: (await request(app).get(`/api/clinic/employees/${created.body.id}`).set('Cookie', cookies[0])).body.editVersion ?? 1,name:'Delegate',username:'delegate',roleIds:[admin.id]});expect(escalate.status).toBe(403);
    const createAdmin=await request(app).post('/api/clinic/employees').set('Origin',origin).set('Cookie',delegate).send({name:'New Admin',username:'new-admin',password:'test-password',roleIds:[admin.id]});expect(createAdmin.status).toBe(403);
    const list=await request(app).get('/api/clinic/employees').set('Cookie',delegate);const manager=list.body.find((e:{roles:{key:string}[]})=>e.roles.some(r=>r.key==='admin'));
    const editManager=await request(app).put(`/api/clinic/employees/${manager.id}`).set('Origin',origin).set('Cookie',delegate).send({editVersion: (await request(app).get(`/api/clinic/employees/${manager.id}`).set('Cookie', cookies[0])).body.editVersion ?? 1,name:'Changed manager',username:'changed-manager',roleIds:manager.roles.map((role:{id:string})=>role.id)});expect(editManager.status).toBe(403);
    const unchanged=await request(app).get(`/api/clinic/employees/${manager.id}`).set('Cookie',cookies[0]);expect(unchanged.body).toMatchObject({name:manager.name,username:manager.username});
    const remove=await request(app).put(`/api/clinic/employees/${manager.id}`).set('Origin',origin).set('Cookie',delegate).send({editVersion: (await request(app).get(`/api/clinic/employees/${manager.id}`).set('Cookie', cookies[0])).body.editVersion ?? 1,name:manager.name,username:manager.username,roleIds:[dentist.id]});expect(remove.status).toBe(403);
    const reset=await request(app).post(`/api/clinic/employees/${manager.id}/reset-password`).set('Origin',origin).set('Cookie',delegate).send({password:'test-password'});expect(reset.status).toBe(403);
    const disable=await request(app).patch(`/api/clinic/employees/${manager.id}/status`).set('Origin',origin).set('Cookie',delegate).send({active:false});expect(disable.status).toBe(403);
  });

});
