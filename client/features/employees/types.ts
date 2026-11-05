export type Role = { id: string; key: string };
export type Employee = {
  id: string;
  name: string;
  username: string;
  active: boolean;
  editVersion: number;
  roles: Role[];
};
export type EmployeeDraft = {
  name: string;
  username: string;
  password: string;
  roleIds: string[];
};
export const emptyEmployeeDraft = (): EmployeeDraft => ({
  name: "",
  username: "",
  password: "",
  roleIds: [],
});
