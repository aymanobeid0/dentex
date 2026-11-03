import { z } from 'zod';
import { textSchema, newPasswordSchema } from '../../shared/schemas';
export const createClinicSchema = z.object({ name: textSchema, code: z.string().regex(/^[0-9]{4}$/), managerName: textSchema, managerUsername: textSchema, managerPassword: newPasswordSchema });
export const resetAdministratorSchema = z.object({ password: newPasswordSchema });
export type CreateClinicInput = z.infer<typeof createClinicSchema>;
export type ResetAdministratorInput = z.infer<typeof resetAdministratorSchema>;
