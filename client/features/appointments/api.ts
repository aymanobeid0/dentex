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
