import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../../shared/api/RequestProvider";
import { ApiError } from "../../shared/api/request";
import { useQueryScope } from "../../shared/query/QueryScope";
import { useDisplayedQuery } from "../../shared/query/useDisplayedQuery";
import {
  arrive,
  editAttendance,
  readDoctors,
  readAttendance,
  readQueue,
  searchPatients,
  type Attendance,
  type AttendanceEdit,
  writeVisit,
  readPatientHistory,
  type VisitAction,
  readAppointmentOptions,
  writeAppointmentLink,
  type AppointmentOptions,
} from "./api";
function useVisitsRead<T>(
  key: readonly unknown[],
  read: (signal: AbortSignal) => Promise<T>,
  onExpired: () => void,
  enabled = true,
) {
  const client = useQueryClient(),
    scope = useQueryScope();
  const query = useDisplayedQuery(["visits", ...key], read, onExpired, enabled);
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 403) {
      const others = {
        queryKey: [...scope, "visits"],
        type: "inactive" as const,
      };
      void client.cancelQueries(others);
      client.removeQueries(others);
    }
  }, [query.error, client, scope]);
  return { ...query, data: enabled ? query.data : undefined };
}
export function useAppointmentOptions(row: Attendance, onExpired: () => void) {
  const request = useApi();
  return useVisitsRead(
    ["appointment-options", row.id],
    (signal) => readAppointmentOptions(request, row, signal),
    onExpired,
  );
}
export function useAppointmentLinkWrite() {
  const request = useApi(),
    client = useQueryClient(),
    scope = useQueryScope();
  return useMutation({
    mutationFn: ({
      row,
      options,
      choice,
    }: {
      row: Attendance;
      options: AppointmentOptions;
      choice: string;
    }) => writeAppointmentLink(request, row, options, choice),
    retry: false,
    networkMode: "always",
    gcTime: 0,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [...scope, "visits"] });
      void client.invalidateQueries({ queryKey: [...scope, "appointments"] });
    },
  });
}
export function useAppointmentLinkReview() {
  const request = useApi(),
    client = useQueryClient(),
    scope = useQueryScope();
  return async (row: Attendance) => {
    const current = await client.fetchQuery({
      queryKey: [...scope, "visits", "detail", row.id],
      queryFn: ({ signal }) => readAttendance(request, row.id, signal),
      staleTime: 0,
      retry: false,
    });
    const options = await client.fetchQuery({
      queryKey: [...scope, "visits", "appointment-options", row.id],
      queryFn: ({ signal }) => readAppointmentOptions(request, current, signal),
      staleTime: 0,
      retry: false,
    });
    return { row: current, options };
  };
}
export function useQueue(onExpired: () => void) {
  const request = useApi();
  return useVisitsRead(
    ["queue"],
    (signal) => readQueue(request, signal),
    onExpired,
  );
}
export function usePatientHistory(
  patientId: string,
  page: number,
  onExpired: () => void,
  enabled: boolean,
) {
  const request = useApi();
  return useVisitsRead(
    ["history", patientId, page],
    (signal) => readPatientHistory(request, patientId, page, signal),
    onExpired,
    enabled,
  );
}
export function useDoctors(onExpired: () => void) {
  const request = useApi();
  return useVisitsRead(
    ["doctors"],
    (signal) => readDoctors(request, signal),
    onExpired,
  );
}
export function useAttendancePatients(
  q: string,
  page: number,
  enabled: boolean,
  onExpired: () => void,
) {
  const request = useApi();
  return useVisitsRead(
    ["patients", q, page],
    (signal) => searchPatients(request, q, page, signal),
    onExpired,
    enabled,
  );
}
export function useAttendanceWrite() {
  const request = useApi(),
    client = useQueryClient(),
    scope = useQueryScope();
  return useMutation({
    mutationFn: (
      operation:
        | { kind: "arrive"; patientId: string; doctorId: string }
        | { kind: "edit"; current: Attendance; input: AttendanceEdit }
        | { kind: "visit"; current: Attendance; action: VisitAction },
    ) =>
      operation.kind === "arrive"
        ? arrive(request, {
            patientId: operation.patientId,
            doctorId: operation.doctorId,
          })
        : operation.kind === "visit"
          ? writeVisit(request, operation.current, operation.action)
          : editAttendance(request, operation.current, operation.input),
    retry: false,
    networkMode: "always",
    gcTime: 0,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [...scope, "visits"] });
    },
  });
}
/** Explicit recovery read; its result is frozen by the dialog for comparison. */
export function useAttendanceReview() {
  const request = useApi(),
    client = useQueryClient(),
    scope = useQueryScope();
  return async (id?: string): Promise<{ items: Attendance[] }> => {
    if (id) {
      const row = await client.fetchQuery({
        queryKey: [...scope, "visits", "detail", id],
        queryFn: ({ signal }) => readAttendance(request, id, signal),
        staleTime: 0,
        retry: false,
      });
      return { items: [row] };
    }
    return client.fetchQuery({
      queryKey: [...scope, "visits", "queue"],
      queryFn: ({ signal }) => readQueue(request, signal),
      staleTime: 0,
      retry: false,
    });
  };
}
