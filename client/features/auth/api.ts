import { ApiError, readJson, type ApiRequest } from "../../shared/api/request";
export async function loginAccount(
  request: ApiRequest,
  kind: "clinic" | "platform",
  credentials: { code?: string; username: string; password: string },
) {
  const account = await readJson<Account>(request, `/api/auth/${kind}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  if (
    !account ||
    account.kind !== kind ||
    typeof account.username !== "string" ||
    (account.kind === "clinic" &&
      (typeof account.name !== "string" ||
        !account.clinic ||
        typeof account.clinic.id !== "string" ||
        typeof account.clinic.name !== "string" ||
        typeof account.clinic.code !== "string" ||
        !Array.isArray(account.roles) ||
        !account.roles.every((role) => typeof role === "string") ||
        !Array.isArray(account.permissions) ||
        !account.permissions.every(
          (permission) => typeof permission === "string",
        )))
  )
    throw new ApiError("uncertain");
  return account;
}
export async function logoutAccount(request: ApiRequest) {
  const response = await request("/api/auth/logout", { method: "POST" });
  if (!response.ok)
    throw new ApiError(
      response.status === 401 ? "expired" : "http",
      response.status,
    );
  if (response.status !== 204) throw new ApiError("uncertain");
}

import type { Account } from "./types";
export const readIdentity = (request: ApiRequest, signal?: AbortSignal) =>
  readJson<Account>(request, "/api/auth/me", { signal });
