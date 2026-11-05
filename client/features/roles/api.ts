import type { ApiRequest } from "../../shared/api/request";
import { ApiError, readJson } from "../../shared/api/request";
import type { Role, RoleCatalog } from "./types";
export const readRolePermissions = (
  request: ApiRequest,
  signal?: AbortSignal,
) => readJson<RoleCatalog>(request, "/api/clinic/role-permissions", { signal });
export const saveRolePermissions = (
  request: ApiRequest,
  id: string,
  permissions: string[],
  editVersion: number,
) =>
  readJson<Role>(request, "/api/clinic/role-permissions/" + id, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permissions, editVersion }),
  });

export async function editRolePermissions(
  request: ApiRequest,
  id: string,
  permissions: string[],
  editVersion: number,
) {
  const role = await saveRolePermissions(request, id, permissions, editVersion);
  if (
    role.id !== id ||
    !Array.isArray(role.permissions) ||
    !Number.isInteger(role.editVersion) ||
    role.editVersion <= editVersion
  )
    throw new ApiError("uncertain");
  return role;
}
