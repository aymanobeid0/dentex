import { z } from "zod";
import { ApiError, readJson, type ApiRequest } from "../../shared/api/request";
const itemSchema = z.object({
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
