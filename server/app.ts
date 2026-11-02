import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { createPrismaClient } from './database';
import { hashPassword, verifyPassword } from './password';
import { Prisma } from '../generated/prisma/client';
import { employeeRouter } from './employees';
import { addDefaultPermissions, permissionKeys, rolePermissionsRouter } from './role-permissions';
import { accountRouter } from './account';
import { configureTrustedProxies } from './proxy';

export const prisma = createPrismaClient();
export const app = express();
configureTrustedProxies(app, process.env.TRUST_PROXY);
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());
const secret = () => { const s = process.env.JWT_SECRET; if (!s || s.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters'); return s; };
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/' };
// Unsafe browser requests must explicitly originate from the configured frontend.
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (!process.env.APP_ORIGIN || req.get('origin') !== process.env.APP_ORIGIN)) return res.status(403).json({ error: 'untrusted_origin' });
  next();
});
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'too_many_attempts' } });
app.post('/api/auth/platform/login', loginLimit, async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 200 || password.length > 1024) return res.status(400).json({ error: 'invalid_input' });
  const account = await prisma.platformAdmin.findUnique({ where: { username: username.trim() } });
  if (!account?.active || !(await verifyPassword(password, account.passwordHash))) return res.status(401).json({ error: 'invalid_credentials' });
  const token = jwt.sign({ kind: 'platform', version: account.credentialVersion }, secret(), { subject: account.id, expiresIn: '24h', algorithm: 'HS256' });
  res.cookie('dentex_session', token, cookieOptions).json({ username: account.username, kind: 'platform' });
});

async function clinicIdentity(id:string) {
  const user = await prisma.user.findUnique({ where:{id}, include:{ clinic:true, userRoles:{ include:{ role:{ include:{ permissions:true } } } } } });
  if (!user) return null;
  return { user, identity:{ kind:'clinic' as const, username:user.username, name:user.name, clinic:{ id:user.clinic.id, name:user.clinic.name, code:user.clinic.code }, roles:user.userRoles.map(ur=>ur.role.key).sort(), permissions:user.userRoles.some(ur=>ur.role.key==='admin')?[...permissionKeys]:[...new Set(user.userRoles.flatMap(ur=>ur.role.permissions.map(p=>p.permissionKey)))].sort() } };
}
app.post('/api/auth/clinic/login', loginLimit, async (req, res) => {
  const { code, username, password } = req.body || {};
  if (typeof code !== 'string' || !/^[0-9]{4}$/.test(code) || typeof username !== 'string' || username.length > 200 || typeof password !== 'string' || password.length > 1024) return res.status(400).json({error:'invalid_input'});
  const user = await prisma.user.findFirst({where:{username:username.trim(),clinic:{code}}});
  const dummyHash = `scrypt$32768$8$1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
  const passwordValid = await verifyPassword(password, user?.passwordHash ?? dummyHash);
  if (!user?.active || !passwordValid) return res.status(401).json({error:'invalid_credentials'});
  const current = await clinicIdentity(user.id);
  if (!current?.user.active || current.user.credentialVersion !== user.credentialVersion) return res.status(401).json({error:'invalid_credentials'});
  const token = jwt.sign({kind:'clinic',version:current.user.credentialVersion}, secret(), {subject:user.id, expiresIn:'24h', algorithm:'HS256'});
  return res.cookie('dentex_session', token, cookieOptions).json(current.identity);
});
app.post('/api/auth/logout', (_req, res) => res.clearCookie('dentex_session', cookieOptions).status(204).end());
app.use('/api', async (req, res, next) => {
  try {
    const payload = jwt.verify(req.cookies.dentex_session, secret(), { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string' || typeof payload.version !== 'number') return res.status(401).json({error:'unauthorized'});
    if (payload.kind === 'platform') {
      const account = await prisma.platformAdmin.findUnique({where:{id:payload.sub}});
      if (!account?.active || account.credentialVersion !== payload.version) return res.status(401).json({error:'unauthorized'});
      res.locals.identity = {kind:'platform',username:account.username};
      res.locals.platformId = account.id;
      res.locals.credentialVersion = account.credentialVersion;
    } else if (payload.kind === 'clinic') {
      const current = await clinicIdentity(payload.sub);
      if (!current?.user.active || current.user.credentialVersion !== payload.version) return res.status(401).json({error:'unauthorized'});
      res.locals.identity = current.identity;
      res.locals.clinicId = current.user.clinicId;
      res.locals.userId = current.user.id;
      res.locals.credentialVersion = current.user.credentialVersion;
    } else return res.status(401).json({error:'unauthorized'});
    next();
  } catch { return res.status(401).json({error:'unauthorized'}); }
});
app.get('/api/auth/me', (_req, res) => res.json(res.locals.identity));
app.use('/api/clinics', (_req, res, next) => res.locals.identity.kind === 'platform' ? next() : res.status(401).json({error:'unauthorized'}));
app.get('/api/clinics', async (_req, res) => res.json(await prisma.clinic.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } })));
const isUuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
app.get('/api/clinics/:clinicId/admins',async(req,res)=>{
  if(!isUuid(req.params.clinicId))return res.status(404).json({error:'not_found'});
  const clinic=await prisma.clinic.findUnique({where:{id:req.params.clinicId},select:{id:true}});
  if(!clinic)return res.status(404).json({error:'not_found'});
  return res.json(await prisma.user.findMany({where:{clinicId:clinic.id,userRoles:{some:{role:{key:'admin'}}}},select:{id:true,name:true,username:true,active:true},orderBy:{name:'asc'}}));
});
app.post('/api/clinics/:clinicId/admins/:userId/reset-password',async(req,res)=>{
  if(!isUuid(req.params.clinicId)||!isUuid(req.params.userId))return res.status(404).json({error:'not_found'});
  const password=req.body?.password;
  if(typeof password!=='string'||!password.trim()||password.length>1024)return res.status(400).json({error:'invalid_input'});
  const passwordHash=await hashPassword(password);
  const outcome=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM clinics WHERE id = ${req.params.clinicId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM platform_admins WHERE id = ${res.locals.platformId}::uuid FOR UPDATE`;
    const actor=await tx.platformAdmin.findFirst({where:{id:res.locals.platformId,active:true,credentialVersion:res.locals.credentialVersion},select:{id:true}});
    if(!actor)return 'unauthorized';
    const target=await tx.user.findFirst({where:{id:req.params.userId,clinicId:req.params.clinicId,userRoles:{some:{role:{key:'admin'}}}},select:{id:true}});
    if(!target)return 'not_found';
    await tx.user.update({where:{id:target.id},data:{passwordHash,credentialVersion:{increment:1}}});
    return 'ok';
  });
  if(outcome==='unauthorized')return res.status(401).json({error:'unauthorized'});
  if(outcome==='not_found')return res.status(404).json({error:'not_found'});
  return res.status(204).end();
});

app.post('/api/clinics', async (req, res, next) => {
  const { name, code, managerName, managerUsername, managerPassword } = req.body || {};
  const validText = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
  if (!validText(name, 200) || typeof code !== 'string' || !/^[0-9]{4}$/.test(code) || !validText(managerName, 200) || !validText(managerUsername, 200) || typeof managerPassword !== 'string' || managerPassword.trim().length === 0 || managerPassword.length > 1024) return res.status(400).json({ error: 'invalid_input' });
  try {
    const passwordHash = await hashPassword(managerPassword);
    const clinic = await prisma.$transaction(async tx => {
      const clinic = await tx.clinic.create({ data: { name: name.trim(), code }, select: { id: true, name: true, code: true } });
      const admin = await tx.role.create({ data: { clinicId: clinic.id, key: 'admin' } });
      await tx.role.createMany({ data: [{ clinicId: clinic.id, key: 'dentist' }, { clinicId: clinic.id, key: 'receptionist' }] });
      await addDefaultPermissions(tx, await tx.role.findMany({where:{clinicId:clinic.id},select:{id:true,key:true}}));
      const user = await tx.user.create({ data: { clinicId: clinic.id, name: managerName.trim(), username: managerUsername.trim(), passwordHash } });
      await tx.userRole.create({ data: { clinicId: clinic.id, roleId: admin.id, userId: user.id } });
      return clinic;
    });
    return res.status(201).json(clinic);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return res.status(409).json({ error: 'duplicate_code' });
    return next(err);
  }
});

app.use('/api/clinic/role-permissions', rolePermissionsRouter(prisma));
app.use('/api/clinic', accountRouter(prisma));
app.use('/api/clinic', employeeRouter(prisma));
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
if (process.env.NODE_ENV === 'production') app.use(express.static('dist'));
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { console.error('Request failed'); res.status(500).json({ error: 'server_error' }); });
