import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { verifyPassword } from './password';

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
  res.cookie('dentex_session', token, cookieOptions).json({ username: account.username });
});
app.post('/api/auth/logout', (_req, res) => res.clearCookie('dentex_session', cookieOptions).status(204).end());
app.use('/api', async (req, res, next) => {
  try {
    const payload = jwt.verify(req.cookies.dentex_session, secret(), { algorithms: ['HS256'] });
    if (typeof payload === 'string' || payload.kind !== 'platform' || typeof payload.sub !== 'string' || typeof payload.version !== 'number') return res.status(401).json({ error: 'unauthorized' });
    const account = await prisma.platformAdmin.findUnique({ where: { id: payload.sub } });
    if (!account?.active || account.credentialVersion !== payload.version) return res.status(401).json({ error: 'unauthorized' });
    res.locals.account = account;
    next();
  } catch { return res.status(401).json({ error: 'unauthorized' }); }
});
app.get('/api/auth/me', (_req, res) => res.json({ username: res.locals.account.username, kind: 'platform' }));
app.get('/api/clinics', async (_req, res) => res.json(await prisma.clinic.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } })));
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
if (process.env.NODE_ENV === 'production') app.use(express.static('dist'));
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { console.error('Request failed'); res.status(500).json({ error: 'server_error' }); });
