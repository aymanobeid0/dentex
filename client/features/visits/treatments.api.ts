import { z } from "zod";
import { ApiError, readJson, type ApiRequest } from "../../shared/api/request";
export const procedureSchema = z.object({
  id: z.string(),
  patientId: z.string(),
  visitId: z.string(),
  itemId: z.string().nullable(),
  description: z.string(),
  location: z.string(),
  notes: z.string(),
  actorId: z.string(),
  actorName: z.string().optional(),
  recordedAt: z.iso.datetime(),
  editVersion: z.number().int().positive(),
  voidedAt: z.iso.datetime().nullable(),
  voidActorId: z.string().nullable(),
  voidActorName: z.string().optional(),
  voidReason: z.string().nullable(),
  visit: z.object({
    id: z.string(),
    attendanceId: z.string(),
    doctorId: z.string(),
    doctorName: z.string().optional(),
    startedAt: z.iso.datetime(),
    status: z.string(),
  }),
});
const itemSchema = z.object({
  performances: z.array(procedureSchema).optional(),
  procedure: procedureSchema.nullable().optional(),
  id: z.string(),
  planId: z.string(),
  patientId: z.string(),
  description: z.string(),
  location: z.string(),
  notes: z.string(),
  status: z.enum(["pending", "cancelled"]),
  editVersion: z.number().int().positive(),
});
const changeSchema = z.object({
  id: z.string(),
  kind: z.string(),
  actorId: z.string(),
  actorName: z.string().optional(),
  reason: z.string().nullable(),
  recordedAt: z.iso.datetime(),
  before: z.unknown(),
  after: z.unknown(),
});
export const planSchema = z.object({
  progress: z
    .object({
      completed: z.number(),
      pending: z.number(),
      cancelled: z.number(),
    })
    .optional(),
  id: z.string(),
  patientId: z.string(),
  title: z.string(),
  notes: z.string(),
  status: z.enum(["active", "cancelled"]),
  editVersion: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  items: z.array(itemSchema),
  history: z.array(changeSchema),
});
export type TreatmentPlan = z.infer<typeof planSchema>;
export type TreatmentItem = z.infer<typeof itemSchema>;
export type TreatmentProcedure = z.infer<typeof procedureSchema>;
const visitTreatmentsSchema = z.object({
  patientId: z.string(),
  visitId: z.string(),
  visitVersion: z.number().int().positive(),
  visitStatus: z.string(),
  canRecord: z.boolean(),
  items: z.array(procedureSchema),
  plans: z.array(planSchema),
});
export type VisitTreatmentsData = z.infer<typeof visitTreatmentsSchema>;
export async function readVisitTreatments(
  request: ApiRequest,
  attendanceId: string,
  signal?: AbortSignal,
) {
  const data = await readJson<unknown>(
    request,
    `/api/clinic/visits/${attendanceId}/procedures`,
    { signal },
  );
  const result = visitTreatmentsSchema.safeParse(data);
  if (!result.success) throw new ApiError("network");
  return result.data;
}
export type ProcedureCommand =
  | {
      kind: "record";
      attendanceId: string;
      input: { id: string; visitVersion: number; notes: string } & (
        | { source: "plan"; itemId: string; itemVersion: number }
        | { source: "standalone"; description: string; location: string }
      );
    }
  | { kind: "void"; id: string; editVersion: number; reason: string };
export async function writeProcedure(
  request: ApiRequest,
  command: ProcedureCommand,
) {
  const path =
      command.kind === "record"
        ? `/${command.attendanceId}/procedures`
        : `/procedures/${command.id}/void`,
    body =
      command.kind === "record"
        ? command.input
        : { editVersion: command.editVersion, reason: command.reason };
  const data = await readJson<unknown>(request, `/api/clinic/visits${path}`, {
    method: command.kind === "record" ? "POST" : "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = visitTreatmentsSchema.safeParse(data);
  if (!result.success) throw new ApiError("uncertain");
  const confirmed = result.data.items.find(
    (row) =>
      row.id === (command.kind === "record" ? command.input.id : command.id),
  );
  if (
    !confirmed ||
    (command.kind === "record"
      ? result.data.visitVersion !== command.input.visitVersion + 1 ||
        confirmed.voidedAt !== null
      : confirmed.editVersion !== command.editVersion + 1 ||
        !confirmed.voidedAt)
  )
    throw new ApiError("uncertain");
  return result.data;
}
export async function readTreatmentPlans(
  request: ApiRequest,
  patientId: string,
  signal?: AbortSignal,
) {
  const data = await readJson<unknown>(
    request,
    `/api/clinic/visits/patient/${patientId}/treatment-plans`,
    { signal },
  );
  const parsed = z.object({ items: z.array(planSchema) }).safeParse(data);
  if (!parsed.success) throw new ApiError("network");
  return parsed.data;
}
export async function writeTreatment(
  request: ApiRequest,
  path: string,
  body: object,
  method = "PATCH",
) {
  const data = await readJson<unknown>(request, `/api/clinic/visits${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = planSchema.safeParse(data);
  if (!parsed.success) throw new ApiError("uncertain");
  return parsed.data;
}
