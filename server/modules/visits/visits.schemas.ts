import { z } from "zod";
import { uuidSchema } from "../../shared/schemas";
export const arriveSchema = z
  .object({ patientId: uuidSchema, doctorId: uuidSchema })
  .strict();
export type ArriveInput = z.infer<typeof arriveSchema>;
const editVersion = z.number().int().min(1).max(2147483646);
export const editAttendanceSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("transfer"), doctorId: uuidSchema, editVersion })
    .strict(),
  z.object({ kind: z.literal("leave"), editVersion }).strict(),
]);
export type EditAttendanceInput = z.infer<typeof editAttendanceSchema>;
export const attendancePatientsSchema = z
  .object({
    q: z.string().trim().min(1).max(200),
    page: z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(Number)
      .pipe(z.number().int().max(1000000))
      .default(1),
  })
  .strict();
