import { z } from "zod";
import { uuidSchema } from "../../shared/schemas";

export const bookAppointmentSchema = z
  .object({
    patientId: uuidSchema,
    doctorId: uuidSchema,
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return (
          value.slice(0, 4) !== "0000" &&
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === value
        );
      }),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    durationMinutes: z.number().int().min(5).max(240).multipleOf(5),
    administrativeNote: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((value) => value || null),
  })
  .strict();
export type BookAppointmentInput = z.infer<typeof bookAppointmentSchema>;
