import { blankClinic, type ClinicDraft, type Clinic } from "../types";
import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../../../shared/api/RequestProvider";
import { translations, type Lang } from "../../../shared/i18n";
import { createClinic as createClinicRequest, listClinics } from "../api";
export function useClinics({
  lang,
  onExpired,
}: {
  lang: Lang;
  onExpired: () => void;
}) {
  const fetch = useApi(),
    expire = onExpired,
    t = translations[lang].app;
  const [busy, setBusy] = useState(false),
    [adminClinic, setAdminClinic] = useState<Clinic | null>(null),
    [clinics, setClinics] = useState<Clinic[] | null>(null),
    [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false),
    [clinicForm, setClinicForm] = useState<ClinicDraft>(blankClinic),
    [fieldErrors, setFieldErrors] = useState<
      Partial<
        Record<keyof ClinicDraft, "required" | "codeInvalid" | "duplicate">
      >
    >({}),
    [createError, setCreateError] = useState(""),
    [created, setCreated] = useState(false);
  async function createClinic(e: FormEvent) {
    e.preventDefault();
    const errors: Partial<
      Record<keyof ClinicDraft, "required" | "codeInvalid" | "duplicate">
    > = {};
    for (const key of Object.keys(clinicForm) as (keyof ClinicDraft)[])
      if (!clinicForm[key].trim()) errors[key] = "required";
    if (clinicForm.code && !/^[0-9]{4}$/.test(clinicForm.code))
      errors.code = "codeInvalid";
    setFieldErrors(errors);
    setCreateError("");
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const r = await createClinicRequest(fetch, clinicForm);
      if (r.status === 401) {
        expire();
        return;
      }
      if (r.status === 409) {
        setFieldErrors({ code: "duplicate" });
        return;
      }
      if (!r.ok) {
        setCreateError("createError");
        return;
      }
      setClinicForm(blankClinic);
      setCreating(false);
      setCreated(true);
      await loadClinics();
    } catch {
      setCreateError("network");
    } finally {
      setBusy(false);
    }
  }
  async function loadClinics() {
    setLoadError(false);
    setClinics(null);
    try {
      const r = await listClinics(fetch);
      if (r.status === 401) {
        expire();
        return;
      }
      if (!r.ok) throw Error();
      setClinics(await r.json());
    } catch {
      setLoadError(true);
    }
  }
  useEffect(() => {
    void loadClinics();
  }, []);

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
    loadClinics,
  };
}
