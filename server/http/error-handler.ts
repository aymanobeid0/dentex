import type { ErrorRequestHandler } from 'express';
import { ApplicationError } from '../shared/errors';

const statuses: Readonly<Record<string, number>> = {
  invalid_input: 400, invalid_roles: 400, invalid_permissions: 400, incorrect_password: 400,
  unauthorized: 401, invalid_credentials: 401,
  forbidden: 403, untrusted_origin: 403, admin_locked: 403,
  not_found: 404,
  numbering_exhausted: 409, edit_conflict: 409, patient_archived: 409, duplicate_code: 409, duplicate_username: 409, last_admin: 409, duplicate_phone: 409,
  too_many_attempts: 429,
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) { next(error); return; }
  const status = error instanceof ApplicationError ? statuses[error.code] : undefined;
  if (status !== undefined && error instanceof ApplicationError) {
    response.status(status).json({ error: error.code });
    return;
  }
  // Do not log request bodies, credentials, SQL parameters or raw error messages.
  console.error('Request failed');
  response.status(500).json({ error: 'server_error' });
};
