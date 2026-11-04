import type { ApiRequest } from "../../shared/api/request";
export const readRolePermissions = (request: ApiRequest) =>
  request("/api/clinic/role-permissions");
export const saveRolePermissions = (
  request: ApiRequest,
  id: string,
  permissions: string[],
) =>
  request("/api/clinic/role-permissions/" + id, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permissions }),
  });
