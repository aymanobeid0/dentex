import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../../shared/api/RequestProvider";
import { useQueryScope } from "../../shared/query/QueryScope";
import { useDisplayedQuery } from "../../shared/query/useDisplayedQuery";
import { bookAppointment, readDoctors, type BookingInput } from "./api";
import {
  readAppointment,
  readAppointments,
  searchPatients,
  type DayFilter,
} from "./api";
import { useEffect } from "react";
import { ApiError } from "../../shared/api/request";
import {
  editAppointment,
  type AppointmentDetail,
  type AppointmentEdit,
} from "./api";
export function useAppointmentEdit() {
  const request = useApi(),
    client = useQueryClient(),
    scope = useQueryScope();
  return useMutation({
    mutationFn: ({
      current,
      input,
    }: {
      current: AppointmentDetail;
      input: AppointmentEdit;
    }) => editAppointment(request, current, input),
    retry: false,
    networkMode: "always",
    gcTime: 0,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [...scope, "appointments"] });
    },
  });
}

function useAppointmentRead<T>(
  key: readonly unknown[],
  read: (signal: AbortSignal) => Promise<T>,
  onExpired: () => void,
  enabled: boolean,
) {
  const client = useQueryClient(),
    scope = useQueryScope();
  const query = useDisplayedQuery(
    ["appointments", ...key],
    read,
    onExpired,
    enabled,
  );
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 403) {
      const others = {
        queryKey: [...scope, "appointments"],
        type: "inactive" as const,
        predicate: (item: { state: { error: unknown } }) =>
          item.state.error !== query.error,
      };
      void client.cancelQueries(others);
      client.removeQueries(others);
    }
  }, [query.error, client, scope]);
  return { ...query, data: enabled ? query.data : undefined };
}
export function useAppointmentList(
  filter: DayFilter | { patientId: string; page: number },
  canRead: boolean,
  onExpired: () => void,
) {
  const request = useApi();
  return useAppointmentRead(
    ["list", filter],
    (signal) => readAppointments(request, filter, signal),
    onExpired,
    canRead,
  );
}
export function useAppointmentDetail(
  id: string,
  canRead: boolean,
  onExpired: () => void,
) {
  const request = useApi();
  return useAppointmentRead(
    ["detail", id],
    (signal) => readAppointment(request, id, signal),
    onExpired,
    canRead,
  );
}
export function useAppointmentPatients(
  q: string,
  page: number,
  enabled: boolean,
  onExpired: () => void,
) {
  const request = useApi();
  return useAppointmentRead(
    ["patients", q, page],
    (signal) => searchPatients(request, q, page, signal),
    onExpired,
    enabled,
  );
}
export function useAppointmentDoctors(enabled: boolean, onExpired: () => void) {
  const request = useApi();
  return useAppointmentRead(
    ["doctors"],
    (signal) => readDoctors(request, signal),
    onExpired,
    enabled,
  );
}
export function useBooking(
  open: boolean,
  canWrite: boolean,
  onExpired: () => void,
) {
  const request = useApi(),
    scope = useQueryScope(),
    client = useQueryClient();
  const doctors = useAppointmentDoctors(open && canWrite, onExpired);
  const mutation = useMutation({
    mutationFn: (input: BookingInput) => bookAppointment(request, input),
    retry: false,
    networkMode: "always",
    gcTime: 0,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [...scope, "appointments"] });
    },
  });
  return { doctors, mutation };
}
