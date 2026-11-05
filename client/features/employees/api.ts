import { ApiError, readJson } from "../../shared/api/request";
import type { Employee, Role } from "./types";
import type { ApiRequest } from "../../shared/api/request";
type EmployeeInput = {
  name: string;
  username: string;
  roleIds: string[];
  password?: string;
  editVersion?: number;
};
export const listEmployees = (request: ApiRequest, signal?: AbortSignal) =>
  readJson<Employee[]>(request, "/api/clinic/employees", { signal });
export const listEmployeeRoles = (request: ApiRequest, signal?: AbortSignal) =>
  readJson<Role[]>(request, "/api/clinic/roles", { signal });
export const saveEmployee = (
  request: ApiRequest,
  id: string | undefined,
  input: EmployeeInput,
) =>
  request(id ? "/api/clinic/employees/" + id : "/api/clinic/employees", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
export const submitEmployeeAction = (
  request: ApiRequest,
  id: string,
  status: boolean,
  input: { active: boolean } | { password: string },
) =>
  request(
    "/api/clinic/employees/" +
      id +
      "/" +
      (status ? "status" : "reset-password"),
    {
      method: status ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );

export const readEmployee = (
  request: ApiRequest,
  id: string,
  signal: AbortSignal,
) => readJson<Employee>(request, "/api/clinic/employees/" + id, { signal });
export async function editEmployee(
  request: ApiRequest,
  id: string,
  input: EmployeeInput & { editVersion: number },
) {
  const result = await readJson<Employee>(
    request,
    "/api/clinic/employees/" + id,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (
    result.id !== id ||
    !Number.isInteger(result.editVersion) ||
    result.editVersion <= input.editVersion
  )
    throw new ApiError("uncertain");
  return result;
}
