import { readJson, type ApiRequest } from "../../shared/api/request";
export type RegistrationInput = {
  name: string;
  phone: string;
  gender: string;
  isChild: boolean;
  birthDate: string | null;
  address: string;
  administrativeNote: string;
};
export const registerPatient = (
  request: ApiRequest,
  input: RegistrationInput,
) =>
  request("/api/clinic/patients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

import type { Patient, PatientSearchResult } from "./types";
export const readPatient = (
  request: ApiRequest,
  id: string,
  signal?: AbortSignal,
) =>
  readJson<Patient>(request, `/api/clinic/patients/${encodeURIComponent(id)}`, {
    signal,
  });
export const searchPatients = (
  request: ApiRequest,
  q: string,
  page: number,
  signal?: AbortSignal,
) =>
  readJson<PatientSearchResult>(
    request,
    `/api/clinic/patients?${new URLSearchParams({ q, page: String(page) })}`,
    { signal },
  );
