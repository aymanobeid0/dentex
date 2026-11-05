import { z } from 'zod';
import { textSchema, newPasswordSchema } from '../../shared/schemas';
const patientFileNumberStart = z.string().trim().max(19).regex(/^[1-9]\d*$/).refine(value => /^[1-9]\d*$/.test(value) && value.length <= 19 && BigInt(value) <= 9223372036854775807n).optional();
export const createClinicSchema = z.object({ name: textSchema, code: z.string().regex(/^[0-9]{4}$/), managerName: textSchema, managerUsername: textSchema, managerPassword: newPasswordSchema, patientFileNumberStart });
export const resetAdministratorSchema = z.object({ password: newPasswordSchema });
export type CreateClinicInput = z.infer<typeof createClinicSchema>;
export type ResetAdministratorInput = z.infer<typeof resetAdministratorSchema>;
