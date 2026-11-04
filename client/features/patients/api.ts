import { ApiError, readJson, type ApiRequest } from "../../shared/api/request";
export type RegistrationInput = {
  name: string;
  phone: string;
  gender: string;
  isChild: boolean;
  birthDate: string | null;
  address: string;
  administrativeNote: string;
};
export const registerPatient = async (
  request: ApiRequest,
  input: RegistrationInput,
) => {
  const receipt = await readJson<{ id: string; fileNumber: string }>(
    request,
    "/api/clinic/patients",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (
    !receipt ||
    typeof receipt.id !== "string" ||
    !receipt.id ||
    typeof receipt.fileNumber !== "string" ||
    !/^\d+$/.test(receipt.fileNumber)
  )
    throw new ApiError("uncertain");
  return receipt;
};

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
