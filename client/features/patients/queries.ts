import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../shared/api/request";
import { useApi } from "../../shared/api/RequestProvider";
import { useQueryScope } from "../../shared/query/QueryScope";
import { useReadAvailability } from "../../shared/query/useReadAvailability";
import { readPatient, registerPatient, searchPatients } from "./api";
import type { Patient, PatientSummary } from "./types";

export function usePatientRegistration(canRead: boolean) {
  const request = useApi(),
    client = useQueryClient(),
    scope = useQueryScope();
  const [reviewInput, setReviewInput] = useState({ phone: "", attempt: 0 });
  useEffect(() => {
    if (!canRead) {
      // Revocation retires completed reviews and cancels pending reads. A later
      // grant requires another explicit server review before resubmission.
      void client.resetQueries({
        queryKey: [...scope, "patients", "registration-review"],
      });
    }
  }, [canRead, client, scope]);
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof registerPatient>[1]) =>
      registerPatient(request, input),
    retry: false,
    networkMode: "always",
    onMutate: (input) =>
      setReviewInput((previous) => ({
        phone: input.phone,
        attempt: previous.attempt + 1,
      })),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [...scope, "patients"] });
    },
  });
  const review = useQuery({
    queryKey: [...scope, "patients", "registration-review", reviewInput],
    enabled: false,
    retry: false,
    queryFn: async ({ signal }) => {
      const items: PatientSummary[] = [];
      let page = 1;
      while (true) {
        const result = await searchPatients(
          request,
          reviewInput.phone,
          page++,
          signal,
        );
        items.push(...result.items);
        if (!result.hasNext) return items;
      }
    },
  });
  return { mutation, review };
}

export type { Patient } from "./types";
type Failure =
  "" | "denied" | "missing" | "network" | "invalid" | "failed" | "origin";
export const blocksPatientData = (error: unknown) =>
  error instanceof ApiError && [400, 401, 403, 404].includes(error.status);

export function usePatientReadFailure(error: unknown, onExpired: () => void) {
  const client = useQueryClient(),
    scope = useQueryScope();
  const expired = useRef(onExpired);
  expired.current = onExpired;
  useEffect(() => {
    if (!(error instanceof ApiError)) return;
    if (error.status === 401) expired.current();
    // A rejected read also invalidates hidden patient copies. Keep the active
    // query's rejection visible, and require a fresh response for other keys.
    if (error.status === 403)
      client.removeQueries({
        queryKey: [...scope, "patients"],
        type: "inactive",
      });
  }, [error, client, scope]);
}

export function usePatientFile(
  id: string,
  enabled: boolean,
  onExpired: () => void,
) {
  const request = useApi(),
    scope = useQueryScope(),
    availability = useReadAvailability();
  const query = useQuery<Patient>({
    queryKey: [...scope, "patients", "file", id],
    queryFn: ({ signal }) => readPatient(request, id, signal),
    enabled: enabled && !!id && availability.online && availability.visible,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });
  usePatientReadFailure(query.error, onExpired);
  const error: Failure =
    !enabled || !id || !query.error
      ? ""
      : query.error instanceof ApiError
        ? query.error.code === "untrusted_origin"
          ? "origin"
          : query.error.status === 403
            ? "denied"
            : query.error.status === 404
              ? "missing"
              : query.error.status === 400
                ? "invalid"
                : query.error.kind === "network"
                  ? "network"
                  : "failed"
        : "network";
  const patient =
    !enabled ||
    !id ||
    ["denied", "missing", "invalid", "origin"].includes(error) ||
    (query.error instanceof ApiError && query.error.status === 401)
      ? null
      : (query.data ?? null);
  return {
    patient,
    error,
    loading: enabled && !!id && query.isPending && availability.online,
    updating: query.isFetching && !!patient,
    stale:
      enabled && !!id && (!availability.online || (!!query.error && !!patient)),
    reload: () => void query.refetch({ cancelRefetch: false }),
  };
}
