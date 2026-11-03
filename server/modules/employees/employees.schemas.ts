import { z } from 'zod';
import { uuidSchema, textSchema, newPasswordSchema } from '../../shared/schemas';
const roleIds = z.array(uuidSchema).min(1).max(3).refine(ids => new Set(ids).size === ids.length);
export const editEmployeeSchema = z.object({ name: textSchema, username: textSchema, roleIds });
// Existing creation checked trimmed length but hashed the original password.
const creationPassword = z.string().refine(value => value.trim().length > 0 && value.trim().length <= 1024);
export const createEmployeeSchema = editEmployeeSchema.extend({ password: creationPassword });
export const employeeStatusSchema = z.object({ active: z.boolean() });
export const resetPasswordSchema = z.object({ password: newPasswordSchema });
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type EditEmployeeInput = z.infer<typeof editEmployeeSchema>;
export type EmployeeStatusInput = z.infer<typeof employeeStatusSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
