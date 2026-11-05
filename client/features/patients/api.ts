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
export async function editPatient(
  request: ApiRequest,
  id: string,
  input: RegistrationInput & { editVersion: number },
) {
  const receipt = await readJson<{
    id: string;
    fileNumber: string;
    editVersion: number;
  }>(request, `/api/clinic/patients/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (
    !receipt ||
    receipt.id !== id ||
    typeof receipt.fileNumber !== "string" ||
    !/^\d+$/.test(receipt.fileNumber) ||
    receipt.editVersion !== input.editVersion + 1
  )
    throw new ApiError("uncertain");
  return receipt;
}
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
  status: "active" | "archived" | "all" = "active",
) =>
  readJson<PatientSearchResult>(
    request,
    `/api/clinic/patients?${new URLSearchParams({ q, page: String(page), ...(status === "active" ? {} : { status }) })}`,
    { signal },
  );
export async function archivePatient(
  request: ApiRequest,
  id: string,
  input: { archived: boolean; editVersion: number },
) {
  const receipt = await readJson<{
    id: string;
    fileNumber: string;
    editVersion: number;
    archived: boolean;
  }>(request, `/api/clinic/patients/${encodeURIComponent(id)}/archive`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (
    !receipt ||
    receipt.id !== id ||
    typeof receipt.fileNumber !== "string" ||
    !/^\d+$/.test(receipt.fileNumber) ||
    receipt.editVersion !== input.editVersion + 1 ||
    receipt.archived !== input.archived
  )
    throw new ApiError("uncertain");
  return receipt;
}

export const lookupOldNumber = (
  request: ApiRequest,
  number: string,
  signal: AbortSignal,
) =>
  readJson<{ id: string; name: string; fileNumber: string }>(
    request,
    "/api/clinic/patients/numbering-history/" + encodeURIComponent(number),
    { signal },
  );
