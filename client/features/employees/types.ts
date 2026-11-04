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
