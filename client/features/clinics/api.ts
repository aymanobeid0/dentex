import { ApiError, readJson, type ApiRequest } from "../../shared/api/request";
import type { Clinic, ClinicAdmin, ClinicDraft } from "./types";
export const listClinics = (request: ApiRequest, signal?: AbortSignal) =>
  readJson<Clinic[]>(request, "/api/clinics", { signal });
export async function createClinic(request: ApiRequest, input: ClinicDraft) {
  const result = await readJson<Clinic>(request, "/api/clinics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (
    !result ||
    typeof result.id !== "string" ||
    !result.id ||
    typeof result.name !== "string" ||
    typeof result.code !== "string" ||
    !/^[0-9]{4}$/.test(result.code)
  )
    throw new ApiError("uncertain");
  return result;
}
export const listClinicAdmins = (
  request: ApiRequest,
  clinicId: string,
  signal?: AbortSignal,
) =>
  readJson<ClinicAdmin[]>(request, `/api/clinics/${clinicId}/admins`, {
    signal,
  });
export async function resetClinicAdminPassword(
  request: ApiRequest,
  clinicId: string,
  id: string,
  password: string,
) {
  const response = await request(
    `/api/clinics/${clinicId}/admins/${id}/reset-password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status === 401 ? "expired" : "http",
      response.status,
      body.error,
    );
  }
  if (response.status !== 204) throw new ApiError("uncertain");
}
export const uncertainClinicWrite = (error: unknown) =>
  !(error instanceof ApiError) ||
  error.kind === "uncertain" ||
  error.kind === "network" ||
  error.status >= 500 ||
  error.status === 408;
