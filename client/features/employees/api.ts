import type { ApiRequest } from "../../shared/api/request";
type EmployeeInput = {
  name: string;
  username: string;
  roleIds: string[];
  password?: string;
};
export const listEmployees = (request: ApiRequest) =>
  request("/api/clinic/employees");
export const listEmployeeRoles = (request: ApiRequest) =>
  request("/api/clinic/roles");
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
