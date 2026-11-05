import { ApiError, readJson } from "../../shared/api/request";
import type { EmployeeDraft, Employee, Role } from "./types";
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

export async function createEmployee(
  request: ApiRequest,
  input: EmployeeDraft,
) {
  const result = await readJson<Employee>(request, "/api/clinic/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!validEmployee(result)) throw new ApiError("uncertain");
  return result;
}
function validEmployee(result: Employee) {
  return (
    result &&
    typeof result.id === "string" &&
    typeof result.name === "string" &&
    typeof result.username === "string" &&
    typeof result.active === "boolean" &&
    Number.isInteger(result.editVersion) &&
    result.editVersion > 0 &&
    Array.isArray(result.roles) &&
    result.roles.every(
      (role) =>
        role && typeof role.id === "string" && typeof role.key === "string",
    )
  );
}
export async function changeEmployeeAccount(
  request: ApiRequest,
  input:
    | { id: string; kind: "status"; active: boolean }
    | { id: string; kind: "reset"; password: string },
) {
  if (input.kind === "status") {
    const result = await readJson<Employee>(
      request,
      `/api/clinic/employees/${input.id}/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: input.active }),
      },
    );
    if (
      !validEmployee(result) ||
      result.id !== input.id ||
      result.active !== input.active
    )
      throw new ApiError("uncertain");
  } else {
    const response = await submitEmployeeAction(request, input.id, false, {
      password: input.password,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status === 401 ? "expired" : "http",
        response.status,
        data.error,
      );
    }
    if (response.status !== 204) throw new ApiError("uncertain");
  }
}
export const uncertainEmployeeWrite = (error: unknown) =>
  !(error instanceof ApiError) ||
  error.kind === "uncertain" ||
  error.kind === "network" ||
  error.status >= 500 ||
  error.status === 408;
