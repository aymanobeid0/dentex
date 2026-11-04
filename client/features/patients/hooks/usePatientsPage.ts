import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../../shared/api/request";
import { translations, type Lang } from "../../../shared/i18n";
import { usePatientFile, usePatientRegistration } from "../queries";
import {
  useRegistrationDraftGuard,
  type NavigationGuard,
} from "./useRegistrationDraftGuard";
type Form = {
  name: string;
  phone: string;
  gender: string;
  birthDate: string;
  address: string;
  administrativeNote: string;
  isChild: boolean;
};
type Failure =
  | ""
  | "denied"
  | "missing"
  | "network"
  | "invalid"
  | "duplicate"
  | "failed"
  | "origin"
  | "uncertain";
type FieldFailure =
  "requiredField" | "invalidPhone" | "invalidDate" | "duplicate";
const responseFailure = (error: unknown): Failure => {
  const codes: Record<string, Failure> = {
    forbidden: "denied",
    untrusted_origin: "origin",
    not_found: "missing",
    invalid_input: "invalid",
    duplicate_phone: "duplicate",
  };
  if (
    !(error instanceof ApiError) ||
    error.kind === "uncertain" ||
    error.status >= 500 ||
    error.status === 408
  )
    return "uncertain";
  if (error.code && codes[error.code]) return codes[error.code];
  return error.status === 403
    ? "denied"
    : error.status === 404
      ? "missing"
      : error.status === 409
        ? "duplicate"
        : error.status === 400
          ? "invalid"
          : "failed";
};
const blank: Form = {
  name: "",
  phone: "",
  gender: "",
  birthDate: "",
  address: "",
  administrativeNote: "",
  isChild: false,
};
const selectedFile = () =>
  window.location.hash === "#patients/new"
    ? ""
    : (/^#patients\/([^/]+)$/.exec(window.location.hash)?.[1] ?? "");
export function usePatientsPage({
  lang,
  canRead,
  canWrite,
  onExpired,
  onNavigationGuardChange,
}: {
  lang: Lang;
  canRead: boolean;
  canWrite: boolean;
  onExpired: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
}) {
  const { mutation, review } = usePatientRegistration(canRead);
  const [uncertain, setUncertain] = useState(false);
  const saveBlocked =
    uncertain && (!canRead || !review.isSuccess || review.isFetching);
  const t = translations[lang].patients;
  const [creating, setCreating] = useState(
    () => window.location.hash === "#patients/new" || (!canRead && canWrite),
  );
  const [id, setId] = useState(selectedFile),
    [form, setForm] = useState<Form>(blank);
  const [receipt, setReceipt] = useState("");
  const [writeError, setError] = useState<Failure>("");
  const busy = mutation.isPending;
  const file = usePatientFile(id, canRead && !creating, onExpired);
  const { patient, loading } = file;
  const error = uncertain ? "uncertain" : writeError || file.error;
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof Form, FieldFailure>>
  >({});
  const submitting = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  const expired = useRef(onExpired);
  expired.current = onExpired;
  useEffect(() => {
    if (review.error instanceof ApiError && review.error.status === 401)
      expired.current();
  }, [review.error]);
  const dirty =
    creating &&
    Object.keys(blank).some(
      (key) => form[key as keyof Form] !== blank[key as keyof Form],
    );
  const guard = useRegistrationDraftGuard(
    dirty,
    busy,
    () => {
      setForm(blank);
      setFieldErrors({});
      setError("");
      setUncertain(false);
    },
    onNavigationGuardChange,
  );
  const currentHash = useRef(window.location.hash);
  useEffect(() => {
    const changed = () => {
      const target = window.location.hash;
      if (target === currentHash.current) return;
      window.history.replaceState(
        null,
        "",
        currentHash.current || window.location.pathname,
      );
      guard.requestLeave(() => {
        window.history.replaceState(
          null,
          "",
          target || window.location.pathname,
        );
        currentHash.current = target;
        setId(selectedFile());
        setCreating(target === "#patients/new");
        setError("");
        setReceipt("");
      });
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, [guard.requestLeave]);
  useEffect(() => {
    if (id && !loading) heading.current?.focus();
  }, [id, loading]);
  useEffect(() => {
    if (!busy && fieldErrors.phone === "duplicate")
      document.getElementById("patient-phone")?.focus();
  }, [busy, fieldErrors.phone]);
  function newPatient() {
    window.location.hash = "patients/new";
    currentHash.current = "#patients/new";
    setCreating(true);
    setId("");
    setForm(blank);
    setFieldErrors({});
    setReceipt("");
    setError("");
    heading.current?.focus();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !canWrite || saveBlocked) return;
    const errors: Partial<Record<keyof Form, FieldFailure>> = {};
    if (!form.name.trim()) errors.name = "requiredField";
    const phone = form.phone
      .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
      .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
      .replace(/[\s-]/g, "");
    if (!/^(?:(?:\+222|00222))?\d{8}$/.test(phone))
      errors.phone = form.phone ? "invalidPhone" : "requiredField";
    if (!form.gender) errors.gender = "requiredField";
    if (form.birthDate) {
      const date = new Date(`${form.birthDate}T00:00:00.000Z`);
      if (
        Number.isNaN(date.valueOf()) ||
        date.toISOString().slice(0, 10) !== form.birthDate ||
        form.birthDate > new Date().toISOString().slice(0, 10) ||
        form.birthDate < "0001-01-01"
      )
        errors.birthDate = "invalidDate";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      document.getElementById(`patient-${Object.keys(errors)[0]}`)?.focus();
      return;
    }
    submitting.current = true;
    setError("");
    setReceipt("");
    try {
      const created = await mutation.mutateAsync({
        ...form,
        birthDate: form.birthDate || null,
      });
      setUncertain(false);
      guard.release();
      setForm(blank);
      setFieldErrors({});
      if (canRead) {
        window.location.hash = `patients/${created.id}`;
        setId(created.id);
      } else setReceipt(created.fileNumber);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        expired.current();
        return;
      }
      if (error instanceof DOMException && error.name === "AbortError") return;
      const failure = responseFailure(error);
      setError(failure);
      setUncertain(failure === "uncertain");
      if (failure === "duplicate") setFieldErrors({ phone: "duplicate" });
    } finally {
      submitting.current = false;
    }
  }
  function changeField<Key extends keyof Form>(key: Key, value: Form[Key]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => ({
      ...previous,
      [key]: undefined,
      ...(key === "isChild" && previous.phone === "duplicate"
        ? { phone: undefined }
        : {}),
    }));
    setError("");
  }
  return {
    lang,
    t,
    creating,
    id,
    form,
    receipt,
    busy,
    file,
    patient,
    loading,
    error,
    fieldErrors,
    heading,
    newPatient,
    submit,
    changeField,
    uncertain,
    saveBlocked,
    review,
    guard,
    backToList: () => {
      window.location.hash = "patients";
    },
  };
}
