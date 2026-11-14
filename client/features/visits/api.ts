import { ApiError, readJson, type ApiRequest } from "../../shared/api/request";
export type PatientChoice = {
  id: string;
  name: string;
  fileNumber: string;
  archived: boolean;
};
export type DoctorChoice = { id: string; name: string; eligible: boolean };
export type Attendance = {
  id: string;
  patient: PatientChoice;
  doctor: DoctorChoice;
  status: "waiting" | "left_before_entry";
  arrivedAt: string;
  recordedEndAt: string | null;
  editVersion: number;
};
export type AttendanceEdit =
  | { kind: "transfer"; doctorId: string; editVersion: number }
  | { kind: "leave"; editVersion: number };
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const identifier = (value: unknown): value is string =>
  typeof value === "string" && uuid.test(value);
const timestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const patient = (value: PatientChoice) =>
  !!value &&
  identifier(value.id) &&
  typeof value.name === "string" &&
  typeof value.fileNumber === "string" &&
  /^[1-9]\d*$/.test(value.fileNumber) &&
  typeof value.archived === "boolean";
const doctor = (value: DoctorChoice) =>
  !!value &&
  identifier(value.id) &&
  typeof value.name === "string" &&
  typeof value.eligible === "boolean";
function snapshot(value: Attendance) {
  return (
    !!value &&
    identifier(value.id) &&
    patient(value.patient) &&
    doctor(value.doctor) &&
    Number.isInteger(value.editVersion) &&
    value.editVersion > 0 &&
    timestamp(value.arrivedAt) &&
    ((value.status === "waiting" && value.recordedEndAt === null) ||
      (value.status === "left_before_entry" &&
        timestamp(value.recordedEndAt) &&
        value.recordedEndAt >= value.arrivedAt))
  );
}
const base = "/api/clinic/visits";
export async function readQueue(request: ApiRequest, signal?: AbortSignal) {
  const value = await readJson<{
    items: Attendance[];
    doctors: DoctorChoice[];
  }>(request, base, { signal });
  if (
    !value ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.doctors) ||
    value.items.some((row) => !snapshot(row) || row.status !== "waiting") ||
    value.doctors.some((row) => !doctor(row))
  )
    throw new ApiError("network");
  return value;
}
export async function readAttendance(
  request: ApiRequest,
  id: string,
  signal?: AbortSignal,
) {
  const value = await readJson<Attendance>(request, `${base}/${id}`, {
    signal,
  });
  if (!snapshot(value) || value.id !== id) throw new ApiError("network");
  return value;
}
export async function readDoctors(request: ApiRequest, signal?: AbortSignal) {
  const value = await readJson<{ items: Array<{ id: string; name: string }> }>(
    request,
    `${base}/doctors`,
    { signal },
  );
  if (
    !value ||
    !Array.isArray(value.items) ||
    value.items.some(
      (row) => !row || !identifier(row.id) || typeof row.name !== "string",
    )
  )
    throw new ApiError("network");
  return value.items;
}
export async function searchPatients(
  request: ApiRequest,
  q: string,
  page: number,
  signal?: AbortSignal,
) {
  const value = await readJson<{
    items: PatientChoice[];
    page: number;
    hasNext: boolean;
  }>(
    request,
    `${base}/patients?${new URLSearchParams({ q, page: String(page) })}`,
    { signal },
  );
  if (
    !value ||
    !Array.isArray(value.items) ||
    value.items.some((row) => !patient(row) || row.archived) ||
    value.page !== page ||
    typeof value.hasNext !== "boolean"
  )
    throw new ApiError("network");
  return value;
}
export async function arrive(
  request: ApiRequest,
  input: { patientId: string; doctorId: string },
) {
  let status = 0;
  const value = await readJson<Attendance>(
    async (url, options) => {
      const response = await request(url, options);
      status = response.status;
      return response;
    },
    base,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (
    status !== 201 ||
    !snapshot(value) ||
    value.patient.id !== input.patientId ||
    value.doctor.id !== input.doctorId ||
    value.status !== "waiting" ||
    value.editVersion !== 1
  )
    throw new ApiError("uncertain");
  return value;
}
export async function editAttendance(
  request: ApiRequest,
  current: Attendance,
  input: AttendanceEdit,
) {
  let status = 0;
  const value = await readJson<Attendance>(
    async (url, options) => {
      const response = await request(url, options);
      status = response.status;
      return response;
    },
    `${base}/${current.id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (
    status !== 200 ||
    !snapshot(value) ||
    value.id !== current.id ||
    value.patient.id !== current.patient.id ||
    value.arrivedAt !== current.arrivedAt ||
    value.editVersion !== input.editVersion + 1 ||
    value.status !==
      (input.kind === "leave" ? "left_before_entry" : "waiting") ||
    value.doctor.id !==
      (input.kind === "transfer" ? input.doctorId : current.doctor.id)
  )
    throw new ApiError("uncertain");
  return value;
}
