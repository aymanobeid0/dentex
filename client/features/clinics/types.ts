export type Clinic = { id: string; name: string; code: string };
export type ClinicDraft = {
  name: string;
  code: string;
  managerName: string;
  managerUsername: string;
  managerPassword: string;
};
export const blankClinic: ClinicDraft = {
  name: "",
  code: "",
  managerName: "",
  managerUsername: "",
  managerPassword: "",
};

export type ClinicAdmin = {
  id: string;
  name: string;
  username: string;
  active: boolean;
};
