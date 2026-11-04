import type { ApiRequest } from "../../shared/api/request";
import type { ClinicDraft } from "./types";
export const listClinics = (request: ApiRequest) => request("/api/clinics");
export const createClinic = (request: ApiRequest, input: ClinicDraft) =>
  request("/api/clinics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
export const listClinicAdmins = (request: ApiRequest, clinicId: string) =>
  request("/api/clinics/" + clinicId + "/admins");
export const resetClinicAdminPassword = (
  request: ApiRequest,
  clinicId: string,
  id: string,
  password: string,
) =>
  request("/api/clinics/" + clinicId + "/admins/" + id + "/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
