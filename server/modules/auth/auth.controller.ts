import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthService } from './auth.service';
import { platformLoginSchema, clinicLoginSchema, sessionPayloadSchema } from './auth.schemas';
import { parseInput } from '../../http/validation';
import { AuthenticationError } from '../../shared/errors';

export const sessionCookieOptions = { httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/' };

export function createAuthController(service: AuthService, secret: () => string) {
  const loginPlatform: RequestHandler = async (request, response) => {
    const session = await service.loginPlatform(parseInput(platformLoginSchema, request.body));
    const token = jwt.sign({ kind: 'platform', version: session.credentialVersion }, secret(), {
      subject: session.platformId, expiresIn: '24h', algorithm: 'HS256',
    });
    response.cookie('dentex_session', token, sessionCookieOptions).json(session.identity);
  };
  const logout: RequestHandler = (_request, response) => {
    response.clearCookie('dentex_session', sessionCookieOptions).status(204).end();
  };
  const loginClinic: RequestHandler = async (request, response) => {
    const session = await service.loginClinic(parseInput(clinicLoginSchema, request.body));
    const token = jwt.sign({ kind: 'clinic', version: session.credentialVersion }, secret(), { subject: session.userId, expiresIn: '24h', algorithm: 'HS256' });
    response.cookie('dentex_session', token, sessionCookieOptions).json(session.identity);
  };
  const authenticate: RequestHandler = async (request, response, next) => {
    let payload;
    try { payload = jwt.verify(request.cookies.dentex_session, secret(), { algorithms: ['HS256'] }); }
    catch { throw new AuthenticationError(); }
    const claims = parseInput(sessionPayloadSchema, payload, 'unauthorized');
    if (claims.kind === 'platform') Object.assign(response.locals, await service.authenticatePlatform(claims.sub, claims.version));
    else Object.assign(response.locals, await service.authenticateClinic(claims.sub, claims.version));
    next();
  };
  const me: RequestHandler = (_request, response) => { response.json(response.locals.identity); };
  return { loginPlatform, loginClinic, logout, authenticate, me };
}
