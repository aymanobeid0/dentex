import { readJson, type ApiRequest } from "../../shared/api/request";
export function loginAccount(
  request: ApiRequest,
  kind: "clinic" | "platform",
  credentials: { code?: string; username: string; password: string },
) {
  return request(`/api/auth/${kind}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
}
export const logoutAccount = (request: ApiRequest) =>
  request("/api/auth/logout", { method: "POST" });

import type { Account } from "./types";
export const readIdentity = (request: ApiRequest, signal?: AbortSignal) =>
  readJson<Account>(request, "/api/auth/me", { signal });
