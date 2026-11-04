import { Plus } from "lucide-react";
import { type Lang } from "../../../shared/i18n";
import { EmployeeActionForm } from "../components/EmployeeActionForm";
import { EmployeeForm } from "../components/EmployeeForm";
import { EmployeeTable } from "../components/EmployeeTable";
import { useEmployees } from "../hooks/useEmployees";
export function EmployeePage({
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
  const {
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
  } = useEmployees({ lang, onExpired, onIdentityChanged, canManageAdmins });
  return (
    <>
      <div className="employee-heading">
        <h1>{t.title}</h1>
        {editing === undefined && !action && (
          <button
            className="primary action"
            disabled={list === null || loadError}
            onClick={() => open(null)}
          >
            <Plus size={16} aria-hidden="true" />
            {t.add}
          </button>
        )}
      </div>
      {action ? (
        <EmployeeActionForm
          t={t}
          busy={busy}
          l={l}
          action={action}
          setAction={setAction}
          newPassword={newPassword}
          setNewPassword={setNewPassword}
          actionError={actionError}
          setActionError={setActionError}
          submitAction={submitAction}
        />
      ) : editing !== undefined ? (
        <EmployeeForm
          canManageAdmins={canManageAdmins}
          t={t}
          roles={roles}
          editing={editing}
          setEditing={setEditing}
          draft={draft}
          setDraft={setDraft}
          error={error}
          setError={setError}
          busy={busy}
          roleName={roleName}
          submit={submit}
        />
      ) : (
        <>
          <p className="success" role="status">
            {notice ? l[notice] : saved ? t.saved : ""}
          </p>
          <EmployeeTable
            canManageAdmins={canManageAdmins}
            t={t}
            list={list}
            loadError={loadError}
            l={l}
            setAction={setAction}
            setNotice={setNotice}
            roleName={roleName}
            load={load}
            open={open}
          />
        </>
      )}
    </>
  );
}
