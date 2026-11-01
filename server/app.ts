import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from './password';
import { Prisma } from '@prisma/client';
import { employeeRouter } from './employees';

export const prisma = new PrismaClient();
export const app = express();
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
  return { user, identity:{ kind:'clinic' as const, username:user.username, name:user.name, clinic:{ id:user.clinic.id, name:user.clinic.name, code:user.clinic.code }, roles:user.userRoles.map(ur=>ur.role.key).sort(), permissions:[...new Set(user.userRoles.flatMap(ur=>ur.role.permissions.map(p=>p.permissionKey)))].sort() } };
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

app.use('/api/clinic', employeeRouter(prisma));
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
if (process.env.NODE_ENV === 'production') app.use(express.static('dist'));
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { console.error('Request failed'); res.status(500).json({ error: 'server_error' }); });
