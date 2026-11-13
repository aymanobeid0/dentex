export const paths = {
  home: "/clinic",
  clinicAccount: "/clinic/account",
  patients: "/clinic/patients",
  appointments: "/clinic/appointments",
  patientNew: "/clinic/patients/new",
  employees: "/clinic/employees",
  rolePermissions: "/clinic/roles",
  clinics: "/platform/clinics",
  platformAccount: "/platform/account",
  clinicLogin: "/clinic/login",
  platformLogin: "/platform/login",
} as const;
export const routeDefinitions = [
  { path: "/", screen: "root" },
  ...Object.entries(paths).map(([screen, path]) => ({ path, screen })),
  { path: "/clinic/patients/:patientId", screen: "patientFile" },
  { path: "/platform", screen: "platformRoot" },
  { path: "*", screen: "notFound" },
] as const;
export type Screen =
  keyof typeof paths | "root" | "platformRoot" | "patientFile" | "notFound";
export type Page =
  | "home"
  | "clinics"
  | "account"
  | "employees"
  | "rolePermissions"
  | "patients"
  | "appointments";
