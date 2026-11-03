import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApplicationError, AuthenticationError } from '../server/shared/errors';
import { errorHandler } from '../server/http/error-handler';
import { parseInput } from '../server/http/validation';

describe('central HTTP errors', () => {
  it.each([['invalid_input', 400], ['unauthorized', 401], ['forbidden', 403], ['not_found', 404], ['last_admin', 409]])('preserves %s', async (code, status) => {
    const app = express();
    app.get('/', () => { throw new ApplicationError(code); });
    app.use(errorHandler);
    const result = await request(app).get('/');
    expect(result.status).toBe(status);
    expect(result.body).toEqual({ error: code });
  });
  it('does not reveal unexpected errors or unregistered domain codes', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const failure of [new Error('sensitive database details'), new ApplicationError('private_code')]) {
        const app = express();
        app.get('/', () => { throw failure; });
        app.use(errorHandler);
        const result = await request(app).get('/');
        expect(result.status).toBe(500);
        expect(result.body).toEqual({ error: 'server_error' });
      }
      expect(log.mock.calls).toEqual([['Request failed'], ['Request failed']]);
    } finally { log.mockRestore(); }
  });
  it('normalizes valid input and maps validation failures to stable codes', () => {
    const schema = z.object({ name: z.string().trim().min(1) });
    expect(parseInput(schema, { name: ' Alice ', ignored: true })).toEqual({ name: 'Alice' });
    expect(() => parseInput(schema, { name: ' ' })).toThrow('invalid_input');
    expect(() => parseInput(schema, {}, 'invalid_permissions')).toThrow('invalid_permissions');
    expect(new AuthenticationError().code).toBe('unauthorized');
  });
});
