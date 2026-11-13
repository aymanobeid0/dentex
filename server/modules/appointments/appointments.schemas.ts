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

export const appointmentPageSchema = z
  .object({
    page: z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(Number)
      .pipe(z.number().int().max(1000000))
      .default(1),
  })
  .strict();
export const appointmentPatientsSchema = appointmentPageSchema.extend({
  q: z.string().trim().max(200).default(""),
});
export const listAppointmentsSchema = appointmentPatientsSchema
  .extend({
    view: z.enum(["day", "week", "month"]).default("day"),
    date: bookAppointmentSchema.shape.date,
    doctorId: uuidSchema.optional(),
    status: z.enum(["booked", "attended", "absent", "cancelled"]).optional(),
  })
  .refine((input) => input.view === "day" || input.page === 1);
export type ListAppointmentsInput = z.infer<typeof listAppointmentsSchema>;
const editVersion = z.number().int().min(1).max(2147483646);
const note = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => value || null);
export const editAppointmentSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("schedule"),
    editVersion,
    doctorId: uuidSchema,
    date: bookAppointmentSchema.shape.date,
    time: bookAppointmentSchema.shape.time,
    durationMinutes: bookAppointmentSchema.shape.durationMinutes,
  }),
  z.strictObject({
    kind: z.literal("note"),
    editVersion,
    administrativeNote: note,
  }),
  z
    .strictObject({
      kind: z.literal("status"),
      editVersion,
      status: z.enum(["booked", "attended", "absent", "cancelled"]),
      cancellationReason: note.optional(),
    })
    .refine(
      (input) => input.status === "cancelled" || !input.cancellationReason,
    ),
]);
export type EditAppointmentInput = z.infer<typeof editAppointmentSchema>;
