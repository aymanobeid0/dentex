import { z } from "zod";
import { uuidSchema } from "../../shared/schemas";
const version = z.number().int().min(1).max(2147483646);
const title = z.string().trim().min(1).max(200);
const notes = z.string().trim().max(2000);
const reason = z.string().trim().min(1).max(500);
export const planCreateSchema = z
  .object({ id: uuidSchema, title, notes })
  .strict();
export const planEditSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("edit"), editVersion: version, title, notes })
    .strict(),
  z
    .object({
      kind: z.literal("status"),
      editVersion: version,
      status: z.enum(["active", "cancelled"]),
      reason,
    })
    .strict(),
]);
export const itemCreateSchema = z
  .object({
    id: uuidSchema,
    editVersion: version,
    description: title,
    location: z.string().trim().max(80),
    notes,
  })
  .strict();
export const itemEditSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("edit"),
      editVersion: version,
      description: title,
      location: z.string().trim().max(80),
      notes,
    })
    .strict(),
  z
    .object({
      kind: z.literal("status"),
      editVersion: version,
      status: z.enum(["pending", "cancelled"]),
      reason,
    })
    .strict(),
]);
export type PlanCreate = z.infer<typeof planCreateSchema>;
export type PlanEdit = z.infer<typeof planEditSchema>;
export type ItemCreate = z.infer<typeof itemCreateSchema>;
export type ItemEdit = z.infer<typeof itemEditSchema>;
export const procedureCreateSchema = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("plan"),
      id: uuidSchema,
      visitVersion: version,
      itemId: uuidSchema,
      itemVersion: version,
      notes,
    })
    .strict(),
  z
    .object({
      source: z.literal("standalone"),
      id: uuidSchema,
      visitVersion: version,
      description: title,
      location: z.string().trim().max(80),
      notes,
    })
    .strict(),
]);
export const procedureVoidSchema = z
  .object({ editVersion: version, reason })
  .strict();
export type ProcedureCreate = z.infer<typeof procedureCreateSchema>;
export type ProcedureVoid = z.infer<typeof procedureVoidSchema>;
