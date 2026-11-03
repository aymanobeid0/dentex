import { z } from 'zod';
import { newPasswordSchema } from '../../shared/schemas';
export const changePasswordSchema = z.object({ currentPassword: z.string().max(1024), newPassword: newPasswordSchema });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
