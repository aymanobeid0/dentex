import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { resolve } from 'node:path';
import { createPrismaClient } from './database';
import { configureTrustedProxies } from './proxy';
import { createServices } from './infrastructure/application';
import { errorHandler } from './http/error-handler';
import { ApplicationError, AuthorizationError } from './shared/errors';
import { createAuthController } from './modules/auth/auth.controller';
import { authRouter, sessionRouter } from './modules/auth/auth.routes';
import { createRolesController } from './modules/roles/roles.controller';
import { rolesRouter } from './modules/roles/roles.routes';
import { createClinicsController } from './modules/clinics/clinics.controller';
import { clinicsRouter } from './modules/clinics/clinics.routes';
import { createEmployeesController } from './modules/employees/employees.controller';
import { employeesRouter } from './modules/employees/employees.routes';
import { createAccountController } from './modules/account/account.controller';
import { accountRouter } from './modules/account/account.routes';
import { createPatientsController } from './modules/patients/patients.controller';
import { patientsRouter } from './modules/patients/patients.routes';
import { createAppointmentsController } from './modules/appointments/appointments.controller';
import { appointmentsRouter } from './modules/appointments/appointments.routes';

export const prisma = createPrismaClient();
export const app = express();
configureTrustedProxies(app, process.env.TRUST_PROXY);
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());
app.use('/api', (req, _res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (!process.env.APP_ORIGIN || req.get('origin') !== process.env.APP_ORIGIN)) throw new AuthorizationError('untrusted_origin');
  next();
});
const services = createServices(prisma);
const secret = () => {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw Error('JWT_SECRET must contain at least 32 characters');
  return value;
};
const auth = createAuthController(services.auth, secret);
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'too_many_attempts' } });
app.use('/api/auth', authRouter(auth, loginLimit));
app.use('/api', sessionRouter(auth));
app.use('/api/clinics', clinicsRouter(createClinicsController(services.clinics)));
app.use('/api/clinic', rolesRouter(createRolesController(services.roles)));
app.use('/api/clinic/account', accountRouter(createAccountController(services.account)));
app.use('/api/clinic/employees', employeesRouter(createEmployeesController(services.employees)));
app.use('/api/clinic/patients', patientsRouter(createPatientsController(services.patients)));
app.use('/api/clinic/appointments', appointmentsRouter(createAppointmentsController(services.appointments)));
app.use('/api', () => { throw new ApplicationError('not_found'); });
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('dist'));
  app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) || !req.accepts('html')) { next(); return; }
    let path: string;
    try { path = decodeURIComponent(req.path); } catch { next(); return; }
    // Vite assets (including extensionless misses) and file-like paths must
    // retain their missing-resource response instead of receiving index.html.
    if (path === '/assets' || path.startsWith('/assets/') || path.split('/').some((part) => part.includes('.'))) { next(); return; }
    res.sendFile(resolve('dist/index.html'));
  });
}
app.use(errorHandler);
