import { z } from 'zod';
import { ApplicationError } from '../shared/errors';

export function parseInput<Schema extends z.ZodType>(schema: Schema, value: unknown, code = 'invalid_input'): z.output<Schema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApplicationError(code);
  return parsed.data;
}
