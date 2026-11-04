import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApi } from "../../../shared/api/RequestProvider";
import { translations, type Lang } from "../../../shared/i18n";
import { registerPatient } from "../api";
import { usePatientFile } from "../queries";
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
  | "origin";
type FieldFailure =
  "requiredField" | "invalidPhone" | "invalidDate" | "duplicate";
const responseFailure = async (response: Response): Promise<Failure> => {
  const codes: Record<string, Failure> = {
    forbidden: "denied",
    untrusted_origin: "origin",
    not_found: "missing",
    invalid_input: "invalid",
    duplicate_phone: "duplicate",
  };
  try {
    const data = await response.json();
    if (codes[data.error]) return codes[data.error];
  } catch {
    /* Generic fallback for non-JSON failures. */
  }
  return response.status === 403
    ? "denied"
    : response.status === 404
      ? "missing"
      : response.status === 409
        ? "duplicate"
        : response.status === 400
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
}: {
  lang: Lang;
  canRead: boolean;
  canWrite: boolean;
  onExpired: () => void;
}) {
  const fetch = useApi();
  const t = translations[lang].patients;
  const [creating, setCreating] = useState(
    () => window.location.hash === "#patients/new" || (!canRead && canWrite),
  );
  const [id, setId] = useState(selectedFile),
    [form, setForm] = useState<Form>(blank);
  const [receipt, setReceipt] = useState("");
  const [writeError, setError] = useState<Failure>(""),
    [busy, setBusy] = useState(false);
  const file = usePatientFile(id, canRead && !creating, onExpired);
  const { patient, loading } = file;
  const error = writeError || file.error;
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof Form, FieldFailure>>
  >({});
  const submitting = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  const expired = useRef(onExpired);
  expired.current = onExpired;
  useEffect(() => {
    const changed = () => {
      setId(selectedFile());
      setCreating(window.location.hash === "#patients/new");
      setError("");
      setReceipt("");
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    if (id && !loading) heading.current?.focus();
  }, [id, loading]);
  useEffect(() => {
    if (!busy && fieldErrors.phone === "duplicate")
      document.getElementById("patient-phone")?.focus();
  }, [busy, fieldErrors.phone]);
  function newPatient() {
    window.location.hash = "patients/new";
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
    if (submitting.current || !canWrite) return;
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
    setBusy(true);
    setError("");
    setReceipt("");
    try {
      const response = await registerPatient(fetch, {
        ...form,
        birthDate: form.birthDate || null,
      });
      if (response.status === 401) {
        expired.current();
        return;
      }
      if (!response.ok) {
        const failure = await responseFailure(response);
        setError(failure);
        if (failure === "duplicate") {
          setFieldErrors({ phone: "duplicate" });
        }
        return;
      }
      const created: { id: string; fileNumber: string } = await response.json();
      setForm(blank);
      setFieldErrors({});
      if (canRead) {
        window.location.hash = `patients/${created.id}`;
        setId(created.id);
      } else setReceipt(created.fileNumber);
    } catch {
      setError("network");
    } finally {
      submitting.current = false;
      setBusy(false);
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
    setCreating,
    id,
    setId,
    form,
    receipt,
    setError,
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
  };
}
