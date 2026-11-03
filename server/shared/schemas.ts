import { z } from 'zod';
export const uuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
export const textSchema = z.string().trim().min(1).max(200);
export const newPasswordSchema = z.string().max(1024).refine(value => value.trim().length > 0);
