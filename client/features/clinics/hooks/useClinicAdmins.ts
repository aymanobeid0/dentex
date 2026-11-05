import type { Clinic, ClinicAdmin } from "../types";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../../../shared/api/RequestProvider";
import { ApiError } from "../../../shared/api/request";
import { translations, type Lang } from "../../../shared/i18n";
import { useDisplayedQuery } from "../../../shared/query/useDisplayedQuery";
import { useQueryScope } from "../../../shared/query/QueryScope";
import { useDraftGuard, type NavigationGuard } from "../../../ui/useDraftGuard";
import {
  listClinicAdmins,
  resetClinicAdminPassword,
  uncertainClinicWrite,
} from "../api";
import { useClinicWriteReview } from "./useClinicWriteReview";
export function useClinicAdmins({
  clinic,
  lang,
  onExpired,
  active,
  externalBusy,
  onNavigationGuardChange,
}: {
  clinic: Clinic;
  lang: Lang;
  onExpired: () => void;
  active: boolean;
  externalBusy: boolean;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
}) {
  const fetch = useApi(),
    t = translations[lang].clinicAdmins,
    scope = useQueryScope(),
    client = useQueryClient();
  const query = useDisplayedQuery(
    ["clinics", clinic.id, "admins"],
    (signal) => listClinicAdmins(fetch, clinic.id, signal),
    onExpired,
    active,
  );
  useEffect(() => {
    if (!active)
      void client.cancelQueries({
        queryKey: [...scope, "clinics", clinic.id, "admins"],
        exact: true,
      });
  }, [active, clinic.id, client, scope]);
  const admins = query.data ?? null,
    loadingError = query.blocked || (!admins && !!query.error);
  const [selected, setSelected] = useState<ClinicAdmin | null>(null),
    [password, setPassword] = useState(""),
    [error, setError] = useState<"required" | "error" | "notFound" | null>(
      null,
    ),
    [saved, setSaved] = useState(false);
  const mutation = useMutation({
    mutationFn: (input: { id: string; password: string }) =>
      resetClinicAdminPassword(fetch, clinic.id, input.id, input.password),
    retry: false,
    networkMode: "always",
    gcTime: 0,
  });
  const busy = mutation.isPending,
    sending = useRef(false);
  const recovery = useClinicWriteReview(
    ["clinics", clinic.id, "reset-review"],
    (signal) => listClinicAdmins(fetch, clinic.id, signal),
    query.blocked,
    query.online && active,
    onExpired,
  );
  function discard() {
    setSelected(null);
    setPassword("");
    setError(null);
    recovery.clear();
  }
  const guard = useDraftGuard(
    !!password || recovery.uncertain,
    busy || externalBusy || recovery.query.isFetching,
    discard,
    onNavigationGuardChange,
  );
  async function reset(event: FormEvent) {
    event.preventDefault();
    if (
      !selected ||
      sending.current ||
      busy ||
      externalBusy ||
      !active ||
      loadingError ||
      recovery.saveBlocked
    )
      return;
    setError(null);
    if (!password.trim()) {
      setError("required");
      return;
    }
    sending.current = true;
    try {
      await mutation.mutateAsync({ id: selected.id, password });
      discard();
      guard.release();
      setSaved(true);
      await client.invalidateQueries({
        queryKey: [...scope, "clinics", clinic.id],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof ApiError && error.status === 401) onExpired();
      else if (uncertainClinicWrite(error)) recovery.markUncertain();
      else
        setError(
          error instanceof ApiError && error.status === 404
            ? "notFound"
            : "error",
        );
    } finally {
      mutation.reset();
      sending.current = false;
    }
  }
  return {
    t,
    admins,
    loadingError,
    selected,
    setSelected,
    password,
    setPassword,
    error,
    setError,
    busy,
    saved,
    setSaved,
    load: () => query.refetch(),
    reset,
    query,
    guard,
    recovery,
    cancel: () => guard.requestLeave(discard),
    saveBlocked: busy || externalBusy || loadingError || recovery.saveBlocked,
  };
}
