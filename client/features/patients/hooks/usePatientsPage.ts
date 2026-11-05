import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../../shared/api/request";
import { translations, type Lang } from "../../../shared/i18n";
import {
  blocksPatientData,
  usePatientEdit,
  usePatientFile,
  usePatientRegistration,
} from "../queries";
import { useReadAvailability } from "../../../shared/query/useReadAvailability";
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
  | "conflict"
  | "exhausted"
  | "archivedHint"
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
    edit_conflict: "conflict",
    patient_archived: "archivedHint",
    numbering_exhausted: "exhausted",
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
  const availability = useReadAvailability();
  const t = translations[lang].patients;
  const [creating, setCreating] = useState(
    () => window.location.hash === "#patients/new" || (!canRead && canWrite),
  );
  const [id, setId] = useState(selectedFile),
    [form, setForm] = useState<Form>(blank);
  const file = usePatientFile(id, canRead && !creating, onExpired);
  const { loading } = file;
  const edit = usePatientEdit(id, canRead && !!file.patient, onExpired);
  const reviewBlocked = blocksPatientData(edit.review.error);
  const patient = reviewBlocked ? null : file.patient;
  const [editing, setEditing] = useState<{
    version: number;
    original: string;
  } | null>(null);
  const [editIssue, setEditIssue] = useState<"conflict" | "uncertain" | null>(
    null,
  );
  const editChanged =
    !!editing && !!patient && patient.editVersion > editing.version;
  const saveBlocked =
    !availability.online ||
    (editing
      ? !!editIssue ||
        editChanged ||
        !!patient?.archived ||
        edit.review.isFetching ||
        !canRead
      : uncertain && (!canRead || !review.isSuccess || review.isFetching));
  const [receipt, setReceipt] = useState("");
  const [savedEdit, setSavedEdit] = useState(false);
  const [writeError, setError] = useState<Failure>("");
  const busy =
    mutation.isPending ||
    edit.mutation.isPending ||
    edit.archiveMutation.isPending;
  const [archiveAction, setArchiveAction] = useState<{
    archived: boolean;
    version: number;
  } | null>(null);
  const [archiveIssue, setArchiveIssue] = useState<Failure>("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReviewed, setArchiveReviewed] = useState(false);
  const archiveFocus = useRef<HTMLElement | null>(null);
  const archiveBlocked =
    !availability.online ||
    !canWrite ||
    !canRead ||
    !patient ||
    edit.review.isFetching ||
    (!!archiveIssue &&
      (!archiveReviewed ||
        !edit.review.isSuccess ||
        edit.review.data.editVersion !== archiveAction?.version));
  const error = reviewBlocked
    ? "denied"
    : editIssue || (uncertain ? "uncertain" : writeError || file.error);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof Form, FieldFailure>>
  >({});
  const submitting = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  const expired = useRef(onExpired);
  expired.current = onExpired;
  useEffect(() => {
    if (
      [review.error, edit.review.error].some(
        (error) => error instanceof ApiError && error.status === 401,
      )
    )
      expired.current();
  }, [review.error, edit.review.error]);
  const dirty =
    !!archiveIssue ||
    !!editIssue ||
    (editing
      ? JSON.stringify(form) !== editing.original
      : creating &&
        Object.keys(blank).some(
          (key) => form[key as keyof Form] !== blank[key as keyof Form],
        ));
  const guard = useRegistrationDraftGuard(
    dirty,
    busy,
    () => {
      setForm(blank);
      setFieldErrors({});
      setError("");
      setUncertain(false);
      setEditing(null);
      setEditIssue(null);
      setArchiveAction(null);
      setArchiveOpen(false);
      setArchiveIssue("");
      setArchiveReviewed(false);
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
        setEditing(null);
        setEditIssue(null);
        setArchiveAction(null);
        setArchiveOpen(false);
        setArchiveIssue("");
        setArchiveReviewed(false);
        setForm(blank);
        setFieldErrors({});
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
    guard.requestLeave(() => {
      window.location.hash = "patients/new";
      currentHash.current = "#patients/new";
      setCreating(true);
      setId("");
      setForm(blank);
      setFieldErrors({});
      setReceipt("");
      setSavedEdit(false);
      setError("");
      heading.current?.focus();
      setEditing(null);
      setEditIssue(null);
    });
  }
  function startEditing() {
    if (!patient || patient.archived || !canRead || !canWrite || busy) return;
    const {
      name,
      phone,
      gender,
      isChild,
      birthDate,
      address,
      administrativeNote,
    } = patient;
    const draft = {
      name,
      phone,
      gender,
      isChild,
      birthDate: birthDate ?? "",
      address: address ?? "",
      administrativeNote: administrativeNote ?? "",
    };
    setForm(draft);
    setEditing({
      version: patient.editVersion,
      original: JSON.stringify(draft),
    });
    setEditIssue(null);
    setError("");
    setReceipt("");
    setFieldErrors({});
  }
  function acknowledgeEditReview() {
    if (
      !editing ||
      !canRead ||
      !canWrite ||
      !edit.review.isSuccess ||
      edit.review.isFetching ||
      !availability.online ||
      !patient ||
      edit.review.data.archived
    )
      return;
    setEditing({ ...editing, version: edit.review.data.editVersion });
    setEditIssue(null);
    setError("");
  }
  function startArchive() {
    if (archiveAction && archiveIssue && canRead && canWrite && !busy) {
      setArchiveOpen(true);
      return;
    }
    if (!patient || !canRead || !canWrite || busy || editing) return;
    archiveFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setArchiveAction({
      archived: !patient.archived,
      version: patient.editVersion,
    });
    setArchiveOpen(true);
    setArchiveIssue("");
    setArchiveReviewed(false);
    setError("");
    setReceipt("");
  }
  function cancelArchive() {
    if (busy) return;
    setArchiveOpen(false);
    if (archiveIssue) return;
    setArchiveAction(null);
    setArchiveOpen(false);
    setArchiveIssue("");
    setArchiveReviewed(false);
  }
  async function submitArchive() {
    if (!archiveAction || submitting.current || busy || archiveBlocked) return;
    submitting.current = true;
    try {
      await edit.archiveMutation.mutateAsync({
        archived: archiveAction.archived,
        editVersion: archiveAction.version,
      });
      guard.release();
      setArchiveAction(null);
      setArchiveOpen(false);
      setArchiveIssue("");
      setArchiveReviewed(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof ApiError && error.status === 401) expired.current();
      else {
        setArchiveIssue(responseFailure(error));
        setArchiveReviewed(false);
      }
    } finally {
      submitting.current = false;
    }
  }
  function acknowledgeArchiveReview(checked: boolean) {
    if (!checked) {
      setArchiveReviewed(false);
      return;
    }
    if (
      !archiveAction ||
      !canRead ||
      !canWrite ||
      !patient ||
      !availability.online ||
      !edit.review.isSuccess ||
      edit.review.isFetching
    )
      return;
    if (edit.review.data.archived === archiveAction.archived) {
      setArchiveAction(null);
      setArchiveOpen(false);
      setArchiveIssue("");
      setArchiveReviewed(false);
      setArchiveOpen(false);
      guard.release();
      file.reload();
      return;
    }
    setArchiveAction({
      ...archiveAction,
      version: edit.review.data.editVersion,
    });
    setArchiveReviewed(true);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !canWrite || saveBlocked || (editing && !patient))
      return;
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
      const payload = {
        ...form,
        birthDate: form.birthDate || null,
      };
      if (editing) {
        const receipt = await edit.mutation.mutateAsync({
          ...payload,
          editVersion: editing.version,
        });
        guard.release();
        setEditing(null);
        setEditIssue(null);
        setForm(blank);
        setFieldErrors({});
        setReceipt(receipt.fileNumber);
        setSavedEdit(true);
        return;
      }
      const created = await mutation.mutateAsync(payload);
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
      if (editing)
        setEditIssue(
          failure === "conflict" || failure === "uncertain" ? failure : null,
        );
      else setUncertain(failure === "uncertain");
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
    savedEdit,
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
    editing,
    edit,
    editIssue,
    startEditing,
    acknowledgeEditReview,
    editChanged,
    cancelEditing: () =>
      guard.requestLeave(() => {
        setEditing(null);
        setEditIssue(null);
        setForm(blank);
        setError("");
      }),
    archiveAction,
    archiveOpen,
    archiveIssue,
    archiveFocus,
    startArchive,
    cancelArchive,
    submitArchive,
    archiveReviewed,
    acknowledgeArchiveReview,
    archiveBlocked,
    backToList: () => {
      window.location.hash = "patients";
    },
  };
}
