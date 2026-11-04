import { emptyEmployeeDraft, type EmployeeDraft } from "../types";
import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "../../../shared/api/RequestProvider";
import { translations, type Lang } from "../../../shared/i18n";
import {
  listEmployeeRoles,
  listEmployees,
  saveEmployee,
  submitEmployeeAction,
} from "../api";
type Role = { id: string; key: string };
type Employee = {
  id: string;
  name: string;
  username: string;
  active: boolean;
  roles: Role[];
};
export function useEmployees({
  lang,
  onExpired,
  onIdentityChanged,
  canManageAdmins,
}: {
  lang: Lang;
  onExpired: () => void;
  onIdentityChanged: () => Promise<void>;
  canManageAdmins: boolean;
}) {
  const fetch = useApi();
  const t = translations[lang].employees;
  const [list, setList] = useState<Employee[] | null>(null),
    [roles, setRoles] = useState<Role[]>([]),
    [loadError, setLoadError] = useState(false);
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
    setLoadError(false);
    setList(null);
    try {
      const [employeesResponse, rolesResponse] = await Promise.all([
        listEmployees(fetch),
        listEmployeeRoles(fetch),
      ]);
      if (employeesResponse.status === 401 || rolesResponse.status === 401) {
        onExpired();
        return;
      }
      if (!employeesResponse.ok || !rolesResponse.ok) {
        setLoadError(true);
        return;
      }
      setList(await employeesResponse.json());
      setRoles(await rolesResponse.json());
    } catch {
      setLoadError(true);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function open(employee: Employee | null) {
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
    setBusy(true);
    try {
      const body = editing
        ? { name: draft.name, username: draft.username, roleIds: draft.roleIds }
        : draft;
      const response = await saveEmployee(fetch, editing?.id, body);
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
