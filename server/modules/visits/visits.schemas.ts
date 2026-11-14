import { z } from "zod";
import { uuidSchema } from "../../shared/schemas";
export const arriveSchema = z
  .object({ patientId: uuidSchema, doctorId: uuidSchema })
  .strict();
export type ArriveInput = z.infer<typeof arriveSchema>;
const editVersion = z.number().int().min(1).max(2147483646);
export const startSchema = z
  .object({
    editVersion,
    previous: z
      .object({
        attendanceId: uuidSchema,
        editVersion,
        visitVersion: editVersion,
        confirmed: z.literal(true),
      })
      .strict()
      .optional(),
  })
  .strict();
export const completeSchema = z
  .object({ editVersion, visitVersion: editVersion })
  .strict();
export const historySchema = z
  .object({
    page: z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(Number)
      .pipe(z.number().int().max(1000000))
      .default(1),
  })
  .strict();
export type StartInput = z.infer<typeof startSchema>;
export type CompleteInput = z.infer<typeof completeSchema>;
const linkFacts = {
  visitId: uuidSchema,
  visitVersion: editVersion,
  expectedLinkVersion: z.number().int().min(0).max(2147483646),
};
export const appointmentLinkSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...linkFacts,
      kind: z.literal("assign"),
      appointmentId: uuidSchema,
      expectedAppointmentVersion: editVersion,
    })
    .strict(),
  z.object({ ...linkFacts, kind: z.literal("detach") }).strict(),
]);
export type AppointmentLinkInput = z.infer<typeof appointmentLinkSchema>;
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

const correctionFacts = {
  editVersion,
  reason: z.string().trim().max(500).optional(),
};
const visitFacts = {
  ...correctionFacts,
  visitId: uuidSchema,
  visitVersion: editVersion,
};
export const correctionSchema = z.discriminatedUnion("kind", [
  z.object({ ...correctionFacts, kind: z.literal("restore_waiting") }).strict(),
  z.object({ ...correctionFacts, kind: z.literal("mark_left") }).strict(),
  z
    .object({
      ...visitFacts,
      kind: z.literal("invalidate_entry"),
      outcome: z.enum(["waiting", "left_before_entry"]),
      confirmed: z.literal(true),
    })
    .strict(),
  z.object({ ...visitFacts, kind: z.literal("reopen_visit") }).strict(),
  z.object({ ...visitFacts, kind: z.literal("confirm_completed") }).strict(),
]);
export type CorrectionInput = z.infer<typeof correctionSchema>;
export const deleteAttendanceSchema = z
  .object({ editVersion, confirmedNeverArrived: z.literal(true) })
  .strict();
export type DeleteAttendanceInput = z.infer<typeof deleteAttendanceSchema>;
