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
  status:
    | "waiting"
    | "left_before_entry"
    | "with_doctor"
    | "completed"
    | "auto_closed";
  arrivedAt: string;
  recordedEndAt: string | null;
  editVersion: number;
  corrections?: Correction[];
  invalidEntries?: VisitEntry[];
  visit?: {
    id: string;
    status: "in_progress" | "completed" | "auto_closed";
    startedAt: string;
    recordedEndAt: string | null;
    editVersion: number;
    appointmentLink?: AppointmentLink;
  };
};
export type VisitEntry = {
  id: string;
  status: "entry_recorded_in_error";
  startedAt: string;
  recordedEndAt: string | null;
  editVersion: number;
};
export type CorrectionState = {
  status: Attendance["status"];
  recordedEndAt: string | null;
  visit?: {
    id: string;
    status:
      "in_progress" | "completed" | "auto_closed" | "entry_recorded_in_error";
    recordedEndAt: string | null;
  };
};
export type Correction = {
  id: string;
  kind: string;
  actor: { id: string; name: string };
  reason: string | null;
  recordedAt: string;
  before: CorrectionState;
  after: CorrectionState;
};
export type CorrectionChoice =
  | "restore_waiting"
  | "mark_left"
  | "invalidate_waiting"
  | "invalidate_left"
  | "reopen_visit"
  | "confirm_completed";
export function correctionChoices(row: Attendance): CorrectionChoice[] {
  const sameDay =
    row.arrivedAt.slice(0, 10) === new Date().toISOString().slice(0, 10);
  if (row.visit)
    return [
      ...(row.visit.startedAt.slice(0, 10) ===
        new Date().toISOString().slice(0, 10) && row.status === "completed"
        ? ["reopen_visit" as const]
        : []),
      ...(row.status === "auto_closed" ? ["confirm_completed" as const] : []),
      ...(sameDay ? ["invalidate_waiting" as const] : []),
      "invalidate_left",
    ];
  if (row.status === "waiting" || row.status === "auto_closed")
    return ["mark_left"];
  return row.status === "left_before_entry" && sameDay
    ? ["restore_waiting"]
    : [];
}
export async function writeCorrection(
  request: ApiRequest,
  row: Attendance,
  choice: CorrectionChoice,
  reason: string,
) {
  const invalidate = choice.startsWith("invalidate_");
  const body = {
    kind: invalidate ? "invalidate_entry" : choice,
    editVersion: row.editVersion,
    ...(reason.trim() ? { reason: reason.trim() } : {}),
    ...(invalidate ||
    choice === "reopen_visit" ||
    choice === "confirm_completed"
      ? { visitId: row.visit!.id, visitVersion: row.visit!.editVersion }
      : {}),
    ...(invalidate
      ? {
          outcome:
            choice === "invalidate_waiting" ? "waiting" : "left_before_entry",
          confirmed: true,
        }
      : {}),
  };
  let responseStatus = 0;
  const value = await readJson<Attendance>(
    async (url, options) => {
      const response = await request(url, options);
      responseStatus = response.status;
      return response;
    },
    `${base}/${row.id}/correction`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const expectedStatus =
    choice === "restore_waiting" || choice === "invalidate_waiting"
      ? "waiting"
      : choice === "reopen_visit"
        ? "with_doctor"
        : choice === "confirm_completed"
          ? "completed"
          : "left_before_entry";
  const addedAudits = value?.corrections?.filter(
    (change) => !row.corrections?.some((before) => before.id === change.id),
  );
  const audit = addedAudits?.length === 1 ? addedAudits[0] : undefined;
  if (
    responseStatus !== 200 ||
    !snapshot(value) ||
    value.id !== row.id ||
    value.patient.id !== row.patient.id ||
    value.doctor.id !== row.doctor.id ||
    value.arrivedAt !== row.arrivedAt ||
    value.editVersion !== row.editVersion + 1 ||
    value.status !== expectedStatus ||
    !audit ||
    audit.kind !== body.kind ||
    audit.reason !== (reason.trim() || null) ||
    audit.before.status !== row.status ||
    audit.after.status !== expectedStatus ||
    (invalidate &&
      !value.invalidEntries?.some((v) => v.id === row.visit?.id)) ||
    (!invalidate && row.visit && value.visit?.id !== row.visit.id)
  )
    throw new ApiError("uncertain");
  return value;
}
export async function deleteAttendance(request: ApiRequest, row: Attendance) {
  const response = await request(`${base}/${row.id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      editVersion: row.editVersion,
      confirmedNeverArrived: true,
    }),
  });
  if (response.status !== 204) {
    if (!response.ok) {
      let value: { error?: string } = {};
      try {
        value = await response.json();
      } catch {}
      throw new ApiError("http", response.status, value.error);
    }
    throw new ApiError("uncertain");
  }
}
export type AppointmentLink = {
  visitId: string;
  appointmentId: string | null;
  editVersion: number;
  appointment?: AppointmentOption | null;
};
export type AppointmentOption = {
  id: string;
  patientId: string;
  doctorId: string;
  doctor: { id: string; name: string };
  startsAt: string;
  status: "booked" | "attended" | "absent" | "cancelled";
  editVersion: number;
};
export type AppointmentOptions = {
  visitId: string;
  visitVersion: number;
  visitDay: string;
  link: AppointmentLink;
  items: AppointmentOption[];
};
const validOption = (item: AppointmentOption) =>
  !!item &&
  identifier(item.id) &&
  identifier(item.patientId) &&
  identifier(item.doctorId) &&
  item.doctor?.id === item.doctorId &&
  typeof item.doctor.name === "string" &&
  !!item.doctor.name &&
  timestamp(item.startsAt) &&
  ["booked", "attended", "absent", "cancelled"].includes(item.status) &&
  Number.isInteger(item.editVersion) &&
  item.editVersion > 0;
const validLink = (link: AppointmentLink, visitId: string) =>
  !!link &&
  link.visitId === visitId &&
  (link.appointmentId === null || identifier(link.appointmentId)) &&
  Number.isInteger(link.editVersion) &&
  link.editVersion >= 0 &&
  (!link.appointment ||
    (validOption(link.appointment) &&
      link.appointment.id === link.appointmentId));
export async function readAppointmentOptions(
  request: ApiRequest,
  row: Attendance,
  signal?: AbortSignal,
) {
  const value = await readJson<AppointmentOptions>(
    request,
    `${base}/${row.id}/appointment-options`,
    { signal },
  );
  if (
    !value ||
    !row.visit ||
    value.visitId !== row.visit.id ||
    !Number.isInteger(value.visitVersion) ||
    value.visitVersion < 1 ||
    value.visitDay !== row.visit.startedAt.slice(0, 10) ||
    !validLink(value.link, row.visit.id) ||
    !Array.isArray(value.items) ||
    value.items.some(
      (item) =>
        !item ||
        !identifier(item.id) ||
        item.patientId !== row.patient.id ||
        !identifier(item.doctorId) ||
        item.doctor?.id !== item.doctorId ||
        !item.doctor.name ||
        !timestamp(item.startsAt) ||
        item.startsAt.slice(0, 10) !== value.visitDay ||
        !["booked", "attended", "absent", "cancelled"].includes(item.status) ||
        !Number.isInteger(item.editVersion) ||
        item.editVersion < 1,
    )
  )
    throw new ApiError("network");
  return value;
}
export async function writeAppointmentLink(
  request: ApiRequest,
  row: Attendance,
  options: AppointmentOptions,
  choice: string,
) {
  const selected = options.items.find((item) => item.id === choice);
  if (!row.visit || (choice !== "none" && !selected))
    throw new ApiError("network");
  const input = {
    visitId: row.visit.id,
    visitVersion: row.visit.editVersion,
    expectedLinkVersion: options.link.editVersion,
    ...(selected
      ? {
          kind: "assign",
          appointmentId: selected.id,
          expectedAppointmentVersion: selected.editVersion,
        }
      : { kind: "detach" }),
  };
  const value = await readJson<Attendance>(
    request,
    `${base}/${row.id}/appointment-link`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
  if (
    !snapshot(value) ||
    value.id !== row.id ||
    value.visit?.id !== row.visit.id ||
    !value.visit.appointmentLink ||
    !validLink(value.visit.appointmentLink, row.visit.id) ||
    value.visit.appointmentLink.editVersion !== options.link.editVersion + 1 ||
    value.visit.appointmentLink.appointmentId !== (selected?.id ?? null) ||
    value.visit.editVersion !== row.visit.editVersion + 1
  )
    throw new ApiError("uncertain");
  return value;
}
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
function validCorrectionState(value: CorrectionState) {
  return (
    !!value &&
    [
      "waiting",
      "left_before_entry",
      "with_doctor",
      "completed",
      "auto_closed",
    ].includes(value.status) &&
    (value.recordedEndAt === null || timestamp(value.recordedEndAt)) &&
    (!value.visit ||
      (identifier(value.visit.id) &&
        [
          "in_progress",
          "completed",
          "auto_closed",
          "entry_recorded_in_error",
        ].includes(value.visit.status) &&
        (value.visit.recordedEndAt === null ||
          timestamp(value.visit.recordedEndAt))))
  );
}
function snapshot(value: Attendance) {
  return (
    !!value &&
    identifier(value.id) &&
    patient(value.patient) &&
    doctor(value.doctor) &&
    Number.isInteger(value.editVersion) &&
    value.editVersion > 0 &&
    timestamp(value.arrivedAt) &&
    (!value.invalidEntries ||
      (Array.isArray(value.invalidEntries) &&
        value.invalidEntries.every(
          (entry) =>
            identifier(entry.id) &&
            entry.status === "entry_recorded_in_error" &&
            timestamp(entry.startedAt) &&
            Number.isInteger(entry.editVersion) &&
            entry.editVersion > 0 &&
            (entry.recordedEndAt === null || timestamp(entry.recordedEndAt)),
        ))) &&
    (!value.corrections ||
      (Array.isArray(value.corrections) &&
        value.corrections.every(
          (change) =>
            identifier(change.id) &&
            identifier(change.actor?.id) &&
            typeof change.actor.name === "string" &&
            !!change.actor.name &&
            timestamp(change.recordedAt) &&
            (change.reason === null || typeof change.reason === "string") &&
            validCorrectionState(change.before) &&
            validCorrectionState(change.after),
        ))) &&
    (!value.visit ||
      (identifier(value.visit.id) &&
        (!value.visit.appointmentLink ||
          validLink(value.visit.appointmentLink, value.visit.id)) &&
        timestamp(value.visit.startedAt) &&
        value.visit.startedAt >= value.arrivedAt &&
        Number.isInteger(value.visit.editVersion) &&
        value.visit.editVersion > 0 &&
        ((value.visit.status === "in_progress" &&
          value.visit.recordedEndAt === null) ||
          (["completed", "auto_closed"].includes(value.visit.status) &&
            timestamp(value.visit.recordedEndAt) &&
            value.visit.recordedEndAt >= value.visit.startedAt)))) &&
    ((value.status === "waiting" &&
      value.recordedEndAt === null &&
      !value.visit) ||
      (value.status === "with_doctor" &&
        value.recordedEndAt === null &&
        value.visit?.status === "in_progress") ||
      (value.status === "completed" &&
        value.visit?.status === "completed" &&
        value.recordedEndAt === value.visit.recordedEndAt) ||
      (value.status === "auto_closed" &&
        timestamp(value.recordedEndAt) &&
        (!value.visit || value.visit.status === "auto_closed")) ||
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
    value.items.some(
      (row) =>
        !snapshot(row) || !["waiting", "with_doctor"].includes(row.status),
    ) ||
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
export type VisitAction =
  { kind: "start"; previous?: Attendance } | { kind: "complete" };
export async function writeVisit(
  request: ApiRequest,
  current: Attendance,
  action: VisitAction,
) {
  let status = 0;
  const body =
    action.kind === "complete"
      ? {
          editVersion: current.editVersion,
          visitVersion: current.visit!.editVersion,
        }
      : {
          editVersion: current.editVersion,
          ...(action.previous
            ? {
                previous: {
                  attendanceId: action.previous.id,
                  editVersion: action.previous.editVersion,
                  visitVersion: action.previous.visit!.editVersion,
                  confirmed: true,
                },
              }
            : {}),
        };
  const value = await readJson<Attendance>(
    async (url, options) => {
      const response = await request(url, options);
      status = response.status;
      return response;
    },
    `${base}/${current.id}/${action.kind}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (
    status !== 200 ||
    !snapshot(value) ||
    value.id !== current.id ||
    value.patient.id !== current.patient.id ||
    value.doctor.id !== current.doctor.id ||
    value.arrivedAt !== current.arrivedAt ||
    value.editVersion !== current.editVersion + 1 ||
    value.status !== (action.kind === "start" ? "with_doctor" : "completed") ||
    !value.visit ||
    value.visit.editVersion !==
      (action.kind === "start" ? 1 : current.visit!.editVersion + 1) ||
    (action.kind === "complete" &&
      (value.visit.id !== current.visit!.id ||
        value.visit.startedAt !== current.visit!.startedAt))
  )
    throw new ApiError("uncertain");
  return value;
}
export async function readPatientHistory(
  request: ApiRequest,
  patientId: string,
  page: number,
  signal?: AbortSignal,
) {
  const value = await readJson<{
    items: Attendance[];
    page: number;
    hasNext: boolean;
  }>(request, `${base}/patient/${patientId}?page=${page}`, { signal });
  if (
    !value ||
    !Array.isArray(value.items) ||
    value.items.some((row) => !snapshot(row) || row.patient.id !== patientId) ||
    value.page !== page ||
    typeof value.hasNext !== "boolean"
  )
    throw new ApiError("network");
  return value;
}
