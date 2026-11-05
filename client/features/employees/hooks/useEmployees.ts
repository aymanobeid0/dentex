import { emptyEmployeeDraft, type EmployeeDraft } from "../types";
import { useState, useRef, useEffect, type FormEvent } from "react";
import { useApi } from "../../../shared/api/RequestProvider";
import { translations, type Lang } from "../../../shared/i18n";
import {
  editEmployee,
  readEmployee,
  listEmployeeRoles,
  listEmployees,
  createEmployee,
  changeEmployeeAccount,
  uncertainEmployeeWrite,
} from "../api";
import type { Employee, Role } from "../types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const createMutation = useMutation({
    mutationFn: (input: EmployeeDraft) => createEmployee(fetch, input),
    retry: false,
    networkMode: "always",
    gcTime: 0,
  });
  const accountMutation = useMutation({
    mutationFn: (input: Parameters<typeof changeEmployeeAccount>[1]) =>
      changeEmployeeAccount(fetch, input),
    retry: false,
    networkMode: "always",
    gcTime: 0,
  });
  const [lifecycleUncertain, setLifecycleUncertain] = useState(false);
  const [lifecycleReviewed, setLifecycleReviewed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
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
  const lifecycleReview = useQuery({
    queryKey: [
      ...scope,
      "employees",
      "lifecycle-review",
      action?.employee.id ?? "create",
    ],
    queryFn: async ({ signal }) =>
      action
        ? [await readEmployee(fetch, action.employee.id, signal)]
        : listEmployees(fetch, signal),
    enabled: false,
    retry: false,
    networkMode: "always",
  });
  const lifecycleGeneration = useRef(0);
  useEffect(() => {
    if (!employeesQuery.blocked && !rolesQuery.blocked) return;
    lifecycleGeneration.current++;
    setLifecycleReviewed(false);
    setAcknowledged(false);
    void client.cancelQueries({
      queryKey: [...scope, "employees", "lifecycle-review"],
    });
  }, [employeesQuery.blocked, rolesQuery.blocked, client, scope]);
  async function reviewLifecycle() {
    if (
      busy ||
      lifecycleReview.isFetching ||
      !employeesQuery.online ||
      loadError
    )
      return;
    const generation = ++lifecycleGeneration.current;
    setLifecycleReviewed(false);
    setAcknowledged(false);
    const result = await lifecycleReview.refetch();
    if (generation === lifecycleGeneration.current && !result.error)
      setLifecycleReviewed(true);
    if (result.error instanceof ApiError && result.error.status === 401)
      onExpired();
  }
  function markLifecycleUncertain() {
    setLifecycleUncertain(true);
    setLifecycleReviewed(false);
    setAcknowledged(false);
  }
  function clearLifecycle() {
    lifecycleGeneration.current++;
    setLifecycleUncertain(false);
    setLifecycleReviewed(false);
    setAcknowledged(false);
  }
  function discardAll() {
    setEditing(undefined);
    setDraft(emptyEmployeeDraft());
    setSaveIssue(null);
    setReviewed(null);
    setAction(null);
    setNewPassword("");
    setActionError(null);
    clearLifecycle();
  }
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
    dirty || !!saveIssue || !!newPassword || lifecycleUncertain,
    busy || reviewBusy || lifecycleReview.isFetching,
    discardAll,
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
    clearLifecycle();
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
      (lifecycleUncertain && !acknowledged) ||
      lifecycleReview.isFetching ||
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
      await createMutation.mutateAsync(draft);
      discardAll();
      setSaved(true);
      guard.release();
      await Promise.all([onIdentityChanged().catch(() => {}), load()]);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof ApiError && error.status === 401) onExpired();
      else if (uncertainEmployeeWrite(error)) {
        markLifecycleUncertain();
      } else
        setError(
          error instanceof ApiError && error.code === "duplicate_username"
            ? "duplicate"
            : error instanceof ApiError && error.code === "invalid_roles"
              ? "invalidRoles"
              : error instanceof ApiError && error.status === 403
                ? "forbidden"
                : "error",
        );
    } finally {
      createMutation.reset();
      sending.current = false;
      setBusy(false);
    }
  }
  async function submitAction(e: FormEvent) {
    e.preventDefault();
    if (
      !action ||
      sending.current ||
      busy ||
      loadError ||
      !employeesQuery.online ||
      lifecycleReview.isFetching ||
      (lifecycleUncertain && !acknowledged)
    )
      return;
    setActionError(null);
    if (action.kind === "reset" && !newPassword.trim()) {
      setActionError("requiredPassword");
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      await accountMutation.mutateAsync(
        action.kind === "status"
          ? {
              id: action.employee.id,
              kind: "status",
              active: !action.employee.active,
            }
          : { id: action.employee.id, kind: "reset", password: newPassword },
      );
      const status = action.kind === "status";
      discardAll();
      guard.release();
      setNotice(status ? "statusSaved" : "resetSaved");
      await Promise.all([onIdentityChanged().catch(() => {}), load()]);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof ApiError && error.status === 401) onExpired();
      else if (uncertainEmployeeWrite(error)) {
        markLifecycleUncertain();
      } else
        setActionError(
          error instanceof ApiError && error.code === "last_admin"
            ? "lastAdmin"
            : error instanceof ApiError && error.status === 403
              ? "forbidden"
              : "error",
        );
    } finally {
      accountMutation.reset();
      sending.current = false;
      setBusy(false);
    }
  }
  return {
    lifecycleUncertain,
    lifecycleReview,
    lifecycleReviewed: lifecycleReviewed && !loadError,
    acknowledged,
    reviewLifecycle,
    acknowledgeLifecycle: () => {
      if (
        lifecycleReviewed &&
        !loadError &&
        employeesQuery.online &&
        !lifecycleReview.isFetching
      )
        setAcknowledged(true);
    },
    actionBlocked:
      busy ||
      loadError ||
      !employeesQuery.online ||
      lifecycleReview.isFetching ||
      (lifecycleUncertain && !acknowledged),
    cancelAction: () => guard.requestLeave(discardAll),
    canManageAdmins,
    cancel: () => guard.requestLeave(discardAll),
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
      (lifecycleUncertain && !acknowledged) ||
      lifecycleReview.isFetching ||
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
