import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../../shared/api/request";
import { useApi } from "../../../shared/api/RequestProvider";
import { useQueryScope } from "../../../shared/query/QueryScope";
import { useReadAvailability } from "../../../shared/query/useReadAvailability";
import { searchPatients } from "../api";
import { blocksPatientData, usePatientReadFailure } from "../queries";
import type { PatientSearchResult } from "../types";

export type { PatientSummary } from "../types";

type Failure = "" | "denied" | "network" | "failed" | "invalidSearch";
type PatientStatus = "active" | "archived" | "all";

export function usePatientSearch(onExpired: () => void) {
  const fetch = useApi(),
    scope = useQueryScope(),
    client = useQueryClient();
  const availability = useReadAvailability();
  const [draft, setDraft] = useState(""),
    [request, setRequest] = useState({
      q: "",
      page: 1,
      status: "active" as PatientStatus,
    });
  const [waiting, setWaiting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false),
    typed = useRef("");
  const key = [
    ...scope,
    "patients",
    "list",
    request.q,
    request.page,
    request.status,
  ];
  const query = useQuery<PatientSearchResult>({
    queryKey: key,
    queryFn: ({ signal }) =>
      searchPatients(fetch, request.q, request.page, signal, request.status),
    enabled: !waiting && availability.online && availability.visible,
    placeholderData: (previous, previousQuery) =>
      blocksPatientData(previousQuery?.state.error) ||
      previousQuery?.queryKey.at(-1) !== request.status
        ? undefined
        : previous,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });
  usePatientReadFailure(query.error, onExpired);
  function clearTimer() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }
  function cancel() {
    void client.cancelQueries({ queryKey: key, exact: true });
  }
  function load(q: string, page: number, status = request.status) {
    clearTimer();
    setWaiting(false);
    if (q === request.q && page === request.page && status === request.status)
      void query.refetch({ cancelRefetch: false });
    else setRequest({ q, page, status });
  }
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  function change(value: string, force = false) {
    const unchanged = value.trim() === typed.current.trim();
    typed.current = value;
    setDraft(value);
    if (unchanged && !force) return;
    clearTimer();
    cancel();
    setWaiting(true);
    if (!composing.current)
      timer.current = setTimeout(() => load(value.trim(), 1), 300);
  }
  function clear() {
    composing.current = false;
    typed.current = "";
    setDraft("");
    load("", 1);
  }
  function compositionStart() {
    composing.current = true;
    clearTimer();
    cancel();
    setWaiting(true);
  }
  function compositionEnd(value: string) {
    composing.current = false;
    change(value, true);
  }
  function search() {
    if (!composing.current) load(typed.current.trim(), 1);
  }
  const error: Failure =
    waiting || !query.error
      ? ""
      : query.error instanceof ApiError
        ? query.error.status === 403
          ? "denied"
          : query.error.status === 400
            ? "invalidSearch"
            : query.error.kind === "network"
              ? "network"
              : "failed"
        : "network";
  // Retain same-query data after transient failure, but never after an authority rejection.
  const result = blocksPatientData(query.error) ? null : (query.data ?? null);
  const loading = waiting || query.isFetching;
  return {
    draft,
    request,
    result,
    error,
    loading,
    change,
    clear,
    load,
    changeStatus: (status: PatientStatus) => {
      cancel();
      load(typed.current.trim(), 1, status);
    },
    search,
    searchPending:
      !waiting &&
      query.isFetching &&
      request.q === draft.trim() &&
      request.page === 1,
    compositionStart,
    compositionEnd,
    stale: !availability.online || (!!error && !!result),
  };
}
