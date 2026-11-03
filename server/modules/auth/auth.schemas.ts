import { z } from 'zod';
import { uuidSchema } from '../../shared/schemas';

// Check the raw length before trimming, preserving the existing HTTP contract.
export const platformLoginSchema = z.object({
  username: z.string().max(200).transform(value => value.trim()),
  password: z.string().max(1024),
});
export type PlatformLoginInput = z.infer<typeof platformLoginSchema>;
export const clinicLoginSchema = platformLoginSchema.extend({ code: z.string().regex(/^[0-9]{4}$/) });
export type ClinicLoginInput = z.infer<typeof clinicLoginSchema>;
export const sessionPayloadSchema = z.object({ sub: uuidSchema, version: z.number(), kind: z.enum(['platform', 'clinic']) });
