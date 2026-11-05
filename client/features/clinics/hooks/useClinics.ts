import { blankClinic, type ClinicDraft, type Clinic } from "../types";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../../../shared/api/RequestProvider";
import { ApiError } from "../../../shared/api/request";
import { translations, type Lang } from "../../../shared/i18n";
import { useDisplayedQuery } from "../../../shared/query/useDisplayedQuery";
import { useQueryScope } from "../../../shared/query/QueryScope";
import { useDraftGuard } from "../../../ui/useDraftGuard";
import {
  createClinic as createClinicRequest,
  listClinics,
  uncertainClinicWrite,
} from "../api";
import { useClinicWriteReview } from "./useClinicWriteReview";
export function useClinics({
  lang,
  onExpired,
  active,
  externalBusy,
}: {
  lang: Lang;
  onExpired: () => void;
  active: boolean;
  externalBusy: boolean;
}) {
  const fetch = useApi(),
    t = translations[lang].app,
    client = useQueryClient(),
    scope = useQueryScope();
  const [adminClinic, setAdminClinic] = useState<Clinic | null>(null);
  const query = useDisplayedQuery(
    ["clinics", "list"],
    (signal) => listClinics(fetch, signal),
    onExpired,
    active && !adminClinic,
  );
  useEffect(() => {
    if (!active || !!adminClinic)
      void client.cancelQueries({
        queryKey: [...scope, "clinics", "list"],
        exact: true,
      });
  }, [active, adminClinic, client, scope]);
  const clinics = query.data ?? null,
    loadError = query.blocked || (!clinics && !!query.error);
  const [creating, setCreating] = useState(false),
    [clinicForm, setClinicForm] = useState<ClinicDraft>(blankClinic),
    [fieldErrors, setFieldErrors] = useState<
      Partial<
        Record<keyof ClinicDraft, "required" | "codeInvalid" | "duplicate">
      >
    >({}),
    [createError, setCreateError] = useState(""),
    [created, setCreated] = useState(false);
  const mutation = useMutation({
    mutationFn: (input: ClinicDraft) => createClinicRequest(fetch, input),
    retry: false,
    networkMode: "always",
    gcTime: 0,
  });
  const recovery = useClinicWriteReview(
    ["clinics", "creation-review"],
    (signal) => listClinics(fetch, signal),
    query.blocked,
    query.online && active,
    onExpired,
  );
  const sending = useRef(false),
    busy = mutation.isPending;
  const dirty =
    creating &&
    Object.keys(blankClinic).some(
      (key) =>
        clinicForm[key as keyof ClinicDraft] !==
        blankClinic[key as keyof ClinicDraft],
    );
  function discard() {
    setClinicForm(blankClinic);
    setCreating(false);
    setFieldErrors({});
    setCreateError("");
    recovery.clear();
  }
  const guard = useDraftGuard(
    dirty || recovery.uncertain,
    busy || externalBusy || recovery.query.isFetching,
    discard,
  );
  async function createClinic(event: FormEvent) {
    event.preventDefault();
    if (
      sending.current ||
      busy ||
      externalBusy ||
      !active ||
      loadError ||
      recovery.saveBlocked
    )
      return;
    const errors: typeof fieldErrors = {};
    for (const key of Object.keys(clinicForm) as (keyof ClinicDraft)[])
      if (!clinicForm[key].trim()) errors[key] = "required";
    if (clinicForm.code && !/^[0-9]{4}$/.test(clinicForm.code))
      errors.code = "codeInvalid";
    setFieldErrors(errors);
    setCreateError("");
    if (Object.keys(errors).length) return;
    sending.current = true;
    try {
      await mutation.mutateAsync(clinicForm);
      discard();
      guard.release();
      setCreated(true);
      await client.invalidateQueries({ queryKey: [...scope, "clinics"] });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof ApiError && error.status === 401) onExpired();
      else if (uncertainClinicWrite(error)) recovery.markUncertain();
      else if (error instanceof ApiError && error.code === "duplicate_code")
        setFieldErrors({ code: "duplicate" });
      else setCreateError("createError");
    } finally {
      mutation.reset();
      sending.current = false;
    }
  }
  return {
    t,
    busy,
    adminClinic,
    setAdminClinic,
    clinics,
    loadError,
    creating,
    setCreating,
    clinicForm,
    setClinicForm,
    fieldErrors,
    setFieldErrors,
    createError,
    setCreateError,
    created,
    setCreated,
    createClinic,
    loadClinics: () => query.refetch(),
    query,
    guard,
    recovery,
    cancel: () => guard.requestLeave(discard),
    saveBlocked: busy || externalBusy || loadError || recovery.saveBlocked,
  };
}
