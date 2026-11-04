import type { ApiRequest } from "../../shared/api/request";
export const changePassword = (
  request: ApiRequest,
  currentPassword: string,
  newPassword: string,
) =>
  request("/api/clinic/account/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
