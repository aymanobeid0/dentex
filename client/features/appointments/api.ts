import { ApiError, readJson, type ApiRequest } from "../../shared/api/request";
export type BookingInput = {
  patientId: string;
  doctorId: string;
  date: string;
  time: string;
  durationMinutes: number;
  administrativeNote: string;
};
export type BookingReceipt = {
  id: string;
  patientId: string;
  doctorId: string;
  startsAt: string;
  endsAt: string;
  status: "booked";
  editVersion: number;
};
export type Doctor = { id: string; name: string };
export type PatientChoice = {
  id: string;
  name: string;
  phone: string;
  fileNumber: string;
  archived: boolean;
};
export type AppointmentStatus = "booked" | "attended" | "absent" | "cancelled";
export type AppointmentRow = {
  id: string;
  patient: Omit<PatientChoice, "phone">;
  doctor: Doctor & { eligible: boolean };
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  editVersion: number;
};
export type AppointmentList = {
  items: AppointmentRow[];
  total: number;
  page: number;
  hasNext: boolean;
};
export type AppointmentSnapshot = {
  doctor?: Doctor;
  cancellationReason?: string | null;
  id: string;
  patientId: string;
  doctorId: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  editVersion: number;
  administrativeNote: string | null;
};
export type AppointmentEdit =
  | {
      kind: "schedule";
      editVersion: number;
      doctorId: string;
      date: string;
      time: string;
      durationMinutes: number;
    }
  | { kind: "note"; editVersion: number; administrativeNote: string }
  | {
      kind: "status";
      editVersion: number;
      status: AppointmentStatus;
      cancellationReason?: string;
    };
export async function editAppointment(
  request: ApiRequest,
  current: AppointmentDetail,
  input: AppointmentEdit,
): Promise<AppointmentSnapshot> {
  let status = 0;
  const data = await readJson<AppointmentSnapshot>(
    async (url, options) => {
      const response = await request(url, options);
      status = response.status;
      return response;
    },
    `/api/clinic/appointments/${encodeURIComponent(current.id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const expectedStart =
    input.kind === "schedule"
      ? new Date(`${input.date}T${input.time}:00.000Z`).toISOString()
      : current.startsAt;
  const expectedEnd =
    input.kind === "schedule"
      ? new Date(
          Date.parse(expectedStart) + input.durationMinutes * 60000,
        ).toISOString()
      : current.endsAt;
  if (
    status !== 200 ||
    !data ||
    data.id !== current.id ||
    data.patientId !== current.patient.id ||
    data.doctorId !==
      (input.kind === "schedule" ? input.doctorId : current.doctor.id) ||
    data.startsAt !== expectedStart ||
    data.endsAt !== expectedEnd ||
    data.status !== (input.kind === "status" ? input.status : current.status) ||
    data.administrativeNote !==
      (input.kind === "note"
        ? input.administrativeNote.trim() || null
        : current.administrativeNote) ||
    data.editVersion !== input.editVersion + 1
  )
    throw new ApiError("uncertain");
  return data;
}
export type AppointmentDetail = Omit<AppointmentRow, "patient"> & {
  patient: PatientChoice;
  administrativeNote: string | null;
  createdAt: string;
  createdBy: Doctor;
  changes: {
    id: string;
    action: string;
    actor: Doctor;
    createdAt: string;
    before: AppointmentSnapshot | null;
    after: AppointmentSnapshot;
  }[];
};
export type DayFilter = {
  view?: "day" | "week" | "month";
  date: string;
  doctorId: string;
  status: string;
  q: string;
  page: number;
};

function validRow(row: AppointmentRow) {
  return (
    row &&
    uuid.test(row.id) &&
    row.patient &&
    uuid.test(row.patient.id) &&
    typeof row.patient.name === "string" &&
    typeof row.patient.fileNumber === "string" &&
    typeof row.patient.archived === "boolean" &&
    row.doctor &&
    uuid.test(row.doctor.id) &&
    typeof row.doctor.name === "string" &&
    typeof row.doctor.eligible === "boolean" &&
    ["booked", "attended", "absent", "cancelled"].includes(row.status) &&
    Number.isInteger(row.editVersion) &&
    row.editVersion > 0 &&
    Number.isFinite(Date.parse(row.startsAt)) &&
    Number.isFinite(Date.parse(row.endsAt))
  );
}
export async function readAppointments(
  request: ApiRequest,
  filter: DayFilter | { patientId: string; page: number },
  signal: AbortSignal,
): Promise<AppointmentList> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter))
    if (key !== "patientId" && value !== "") params.set(key, String(value));
  const path =
    "patientId" in filter
      ? `/patient/${encodeURIComponent(filter.patientId)}`
      : "";
  const data = await readJson<AppointmentList>(
    request,
    `/api/clinic/appointments${path}?${params}`,
    { signal },
  );
  if (
    !data ||
    !Array.isArray(data.items) ||
    data.items.some((row) => !validRow(row)) ||
    !Number.isInteger(data.total) ||
    data.total < 0 ||
    data.page !== filter.page ||
    typeof data.hasNext !== "boolean" ||
    ("view" in filter &&
      filter.view !== undefined &&
      filter.view !== "day" &&
      (data.hasNext || data.items.length !== data.total))
  )
    throw new ApiError("network");
  return data;
}
export async function readAppointment(
  request: ApiRequest,
  id: string,
  signal: AbortSignal,
): Promise<AppointmentDetail> {
  const data = await readJson<AppointmentDetail>(
    request,
    `/api/clinic/appointments/${encodeURIComponent(id)}`,
    { signal },
  );
  if (
    !validRow(data) ||
    data.id !== id ||
    typeof data.patient.phone !== "string" ||
    !(
      data.administrativeNote === null ||
      typeof data.administrativeNote === "string"
    ) ||
    !data.createdBy ||
    typeof data.createdBy.name !== "string" ||
    !Array.isArray(data.changes) ||
    data.changes.some(
      (change) =>
        !change.actor ||
        typeof change.actor.name !== "string" ||
        !change.after ||
        !Number.isFinite(Date.parse(change.createdAt)),
    )
  )
    throw new ApiError("network");
  return data;
}
export async function searchPatients(
  request: ApiRequest,
  q: string,
  page: number,
  signal: AbortSignal,
) {
  const data = await readJson<{
    items: PatientChoice[];
    page: number;
    hasNext: boolean;
  }>(
    request,
    `/api/clinic/appointments/patients?${new URLSearchParams({ q, page: String(page) })}`,
    { signal },
  );
  if (
    !data ||
    !Array.isArray(data.items) ||
    data.page !== page ||
    typeof data.hasNext !== "boolean" ||
    data.items.some(
      (item) =>
        !item ||
        !uuid.test(item.id) ||
        typeof item.name !== "string" ||
        typeof item.fileNumber !== "string" ||
        typeof item.phone !== "string" ||
        item.archived !== false,
    )
  )
    throw new ApiError("network");
  return data;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function readDoctors(
  request: ApiRequest,
  signal: AbortSignal,
): Promise<Doctor[]> {
  const data = await readJson<{ items: Doctor[] }>(
    request,
    "/api/clinic/appointments/doctors",
    { signal },
  );
  if (
    !data ||
    !Array.isArray(data.items) ||
    data.items.some(
      (item) =>
        !item ||
        typeof item.id !== "string" ||
        !uuid.test(item.id) ||
        typeof item.name !== "string",
    )
  )
    throw new ApiError("network");
  return data.items;
}
export async function bookAppointment(
  request: ApiRequest,
  input: BookingInput,
): Promise<BookingReceipt> {
  let status = 0;
  const receipt = await readJson<BookingReceipt>(
    async (url, options) => {
      const response = await request(url, options);
      status = response.status;
      return response;
    },
    "/api/clinic/appointments",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const start = new Date(`${input.date}T${input.time}:00.000Z`);
  if (
    status !== 201 ||
    !receipt ||
    typeof receipt.id !== "string" ||
    !uuid.test(receipt.id) ||
    receipt.patientId !== input.patientId ||
    receipt.doctorId !== input.doctorId ||
    receipt.status !== "booked" ||
    receipt.editVersion !== 1 ||
    receipt.startsAt !== start.toISOString() ||
    receipt.endsAt !==
      new Date(start.getTime() + input.durationMinutes * 60000).toISOString()
  )
    throw new ApiError("uncertain");
  return receipt;
}
