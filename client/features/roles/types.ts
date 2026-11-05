export type Role = {
  id: string;
  key: string;
  editVersion: number;
  permissions: string[];
};
export type RoleCatalog = { roles: Role[]; permissions: string[] };
