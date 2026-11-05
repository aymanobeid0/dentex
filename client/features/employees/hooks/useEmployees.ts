import { emptyEmployeeDraft, type EmployeeDraft } from "../types";
import { useState, useRef, useEffect, type FormEvent } from "react";
import { useApi } from "../../../shared/api/RequestProvider";
import { translations, type Lang } from "../../../shared/i18n";
import {
  editEmployee,
  readEmployee,
  listEmployeeRoles,
  listEmployees,
  saveEmployee,
  submitEmployeeAction,
} from "../api";
import type { Employee, Role } from "../types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../shared/api/request";
import { useQueryScope } from "../../../shared/query/QueryScope";
import { useDisplayedQuery } from "../../../shared/query/useDisplayedQuery";
import { useDraftGuard, type NavigationGuard } from "../../../ui/useDraftGuard";
export function useEmployees({
  lang,
  onExpired,
  onIdentityChanged,
  canManageAdmins,
  onNavigationGuardChange,
}: {
  lang: Lang;
  onExpired: () => void;
  onIdentityChanged: () => Promise<void>;
  canManageAdmins: boolean;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
}) {
  const fetch = useApi();
  const t = translations[lang].employees;
  const client = useQueryClient(),
    scope = useQueryScope();
  const employeesQuery = useDisplayedQuery<Employee[]>(
    ["employees", "list"],
    (signal) => listEmployees(fetch, signal),
    onExpired,
  );
  const rolesQuery = useDisplayedQuery<Role[]>(
    ["employees", "roles"],
    (signal) => listEmployeeRoles(fetch, signal),
    onExpired,
  );
  const list = employeesQuery.data ?? null,
    roles = rolesQuery.data ?? [];
  const loadError =
    employeesQuery.blocked ||
    rolesQuery.blocked ||
    (!list && !!employeesQuery.error) ||
    (!rolesQuery.data && !!rolesQuery.error);
  const [reviewed, setReviewed] = useState<Employee | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false),
    [reviewFailed, setReviewFailed] = useState(false);
  const [saveIssue, setSaveIssue] = useState<"conflict" | "uncertain" | null>(
    null,
  );
  const sending = useRef(false),
    reviewGeneration = useRef(0);
  useEffect(() => {
    if (!employeesQuery.blocked && !rolesQuery.blocked) return;
    reviewGeneration.current++;
    setReviewed(null);
    void client.cancelQueries({ queryKey: [...scope, "employees", "review"] });
  }, [employeesQuery.blocked, rolesQuery.blocked, client, scope]);
  const mutation = useMutation({
    mutationFn: (input: {
      id: string;
      body: {
        name: string;
        username: string;
        roleIds: string[];
        editVersion: number;
      };
    }) => editEmployee(fetch, input.id, input.body),
    retry: false,
    networkMode: "always",
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [...scope, "employees"] });
    },
  });
  const [editing, setEditing] = useState<Employee | null | undefined>(
      undefined,
    ),
    [draft, setDraft] = useState<EmployeeDraft>(emptyEmployeeDraft),
    [error, setError] = useState<keyof typeof t | null>(null),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  const l = translations[lang].employeeLifecycle;
  const [action, setAction] = useState<{
      kind: "status" | "reset";
      employee: Employee;
    } | null>(null),
    [newPassword, setNewPassword] = useState(""),
    [actionError, setActionError] = useState<
      keyof typeof t | "requiredPassword" | null
    >(null),
    [notice, setNotice] = useState<"statusSaved" | "resetSaved" | null>(null);
  const roleName = (role: Role) =>
    t[role.key as "admin" | "dentist" | "receptionist"] ?? role.key;
  async function load() {
    await Promise.all([employeesQuery.refetch(), rolesQuery.refetch()]);
  }
  const changed =
    !!editing &&
    !!list?.some(
      (item) =>
        item.id === editing.id && item.editVersion > editing.editVersion,
    );
  const dirty =
    editing !== undefined &&
    (draft.name !== (editing?.name ?? "") ||
      draft.username !== (editing?.username ?? "") ||
      !!draft.password ||
      [...draft.roleIds].sort().join() !==
        (editing?.roles
          .map((r) => r.id)
          .sort()
          .join() ?? ""));
  const guard = useDraftGuard(
    dirty || !!saveIssue,
    busy || reviewBusy,
    () => {
      setEditing(undefined);
      setDraft(emptyEmployeeDraft());
      setSaveIssue(null);
      setReviewed(null);
    },
    onNavigationGuardChange,
  );
  async function review() {
    if (!editing || reviewBusy || busy || !employeesQuery.online) return;
    const generation = ++reviewGeneration.current;
    setReviewed(null);
    setReviewFailed(false);
    setReviewBusy(true);
    try {
      const result = await client.fetchQuery({
        queryKey: [...scope, "employees", "review", editing.id],
        staleTime: 0,
        retry: false,
        queryFn: ({ signal }) => readEmployee(fetch, editing.id, signal),
      });
      if (generation === reviewGeneration.current) setReviewed(result);
    } catch {
      setReviewFailed(true);
    } finally {
      setReviewBusy(false);
    }
  }
  function acceptReview(keep: boolean) {
    if (
      !reviewed ||
      employeesQuery.blocked ||
      rolesQuery.blocked ||
      !employeesQuery.online
    )
      return;
    const latest = reviewed;
    if (!keep)
      setDraft({
        name: latest.name,
        username: latest.username,
        password: "",
        roleIds: latest.roles.map((r) => r.id),
      });
    setEditing(latest);
    setReviewed(null);
    setSaveIssue(null);
    setError(null);
  }
  function open(employee: Employee | null) {
    setSaveIssue(null);
    setReviewed(null);
    setReviewFailed(false);
    setEditing(employee);
    setDraft(
      employee
        ? {
            name: employee.name,
            username: employee.username,
            password: "",
            roleIds: employee.roles.map((r) => r.id),
          }
        : emptyEmployeeDraft(),
    );
    setError(null);
    setSaved(false);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (
      sending.current ||
      busy ||
      reviewBusy ||
      saveIssue ||
      changed ||
      loadError ||
      !employeesQuery.online
    )
      return;
    setError(null);
    if (
      !draft.name.trim() ||
      !draft.username.trim() ||
      (!editing && !draft.password.trim()) ||
      !draft.roleIds.length
    ) {
      setError("required");
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      const body = editing
        ? {
            name: draft.name,
            username: draft.username,
            roleIds: draft.roleIds,
            editVersion: editing.editVersion,
          }
        : draft;
      if (editing) {
        try {
          await mutation.mutateAsync({
            id: editing.id,
            body: {
              name: draft.name,
              username: draft.username,
              roleIds: draft.roleIds,
              editVersion: editing.editVersion,
            },
          });
        } catch (error) {
          if (error instanceof ApiError && error.code === "edit_conflict")
            setSaveIssue("conflict");
          else if (
            !(error instanceof ApiError) ||
            error.status >= 500 ||
            error.kind === "uncertain" ||
            error.kind === "network"
          )
            setSaveIssue("uncertain");
          else if (error instanceof ApiError && error.status === 401)
            onExpired();
          else
            setError(
              error instanceof ApiError && error.code === "duplicate_username"
                ? "duplicate"
                : error instanceof ApiError && error.code === "last_admin"
                  ? "lastAdmin"
                  : error instanceof ApiError && error.status === 403
                    ? "forbidden"
                    : "error",
            );
          return;
        }
        setEditing(undefined);
        setDraft(emptyEmployeeDraft());
        setSaved(true);
        guard.release();
        await onIdentityChanged().catch(() => {});
        await load();
        return;
      }
      const response = await saveEmployee(fetch, undefined, body);
      if (response.status === 401) {
        onExpired();
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(
          data.error === "duplicate_username"
            ? "duplicate"
            : data.error === "last_admin"
              ? "lastAdmin"
              : data.error === "invalid_roles"
                ? "invalidRoles"
                : response.status === 403
                  ? "forbidden"
                  : "error",
        );
        return;
      }
      setEditing(undefined);
      setDraft(emptyEmployeeDraft());
      setSaved(true);
      await onIdentityChanged();
      await load();
    } catch {
      setError("error");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function submitAction(e: FormEvent) {
    e.preventDefault();
    if (!action) return;
    setActionError(null);
    if (action.kind === "reset" && !newPassword.trim()) {
      setActionError("requiredPassword");
      return;
    }
    setBusy(true);
    try {
      const status = action.kind === "status";
      const response = await submitEmployeeAction(
        fetch,
        action.employee.id,
        status,
        status
          ? { active: !action.employee.active }
          : { password: newPassword },
      );
      if (response.status === 401) {
        onExpired();
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setActionError(
          data.error === "last_admin"
            ? "lastAdmin"
            : response.status === 403
              ? "forbidden"
              : "error",
        );
        return;
      }
      setAction(null);
      setNewPassword("");
      setNotice(status ? "statusSaved" : "resetSaved");
      await onIdentityChanged();
      await load();
    } catch {
      setActionError("error");
    } finally {
      setBusy(false);
    }
  }
  return {
    canManageAdmins,
    cancel: () =>
      guard.requestLeave(() => {
        setEditing(undefined);
        setDraft(emptyEmployeeDraft());
        setError(null);
        setSaveIssue(null);
        setReviewed(null);
      }),
    guard,
    review,
    reviewed: employeesQuery.blocked || rolesQuery.blocked ? null : reviewed,
    reviewBusy,
    reviewFailed,
    acceptReview,
    saveIssue,
    changed,
    saveBlocked:
      busy ||
      reviewBusy ||
      !!saveIssue ||
      changed ||
      loadError ||
      !employeesQuery.online,
    stale: employeesQuery.stale || rolesQuery.stale,
    online: employeesQuery.online,
    updating: employeesQuery.isFetching || rolesQuery.isFetching,
    t,
    list,
    roles,
    loadError,
    editing,
    setEditing,
    draft,
    setDraft,
    error,
    setError,
    saved,
    busy,
    l,
    action,
    setAction,
    newPassword,
    setNewPassword,
    actionError,
    setActionError,
    notice,
    setNotice,
    roleName,
    load,
    open,
    submit,
    submitAction,
  };
}
