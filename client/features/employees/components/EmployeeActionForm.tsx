import { Save, X } from "lucide-react";
import { Label } from "../../../ui/Label";
import type { useEmployees } from "../hooks/useEmployees";
type Props = Pick<
  ReturnType<typeof useEmployees>,
  | "t"
  | "busy"
  | "l"
  | "action"
  | "setAction"
  | "actionBlocked"
  | "cancelAction"
  | "newPassword"
  | "setNewPassword"
  | "actionError"
  | "setActionError"
  | "submitAction"
>;
export function EmployeeActionForm({
  t,
  busy,
  actionBlocked,
  cancelAction,
  l,
  action,
  setAction,
  newPassword,
  setNewPassword,
  actionError,
  setActionError,
  submitAction,
}: Props) {
  if (!action) return null;

  return (
    <section className="card clinic-form">
      <h2>
        {action.kind === "status"
          ? action.employee.active
            ? l.disable
            : l.enable
          : l.reset}
      </h2>
      <p>{action.employee.name}</p>
      <form onSubmit={submitAction}>
        {action.kind === "status" ? (
          <p>{action.employee.active ? l.confirmDisable : l.confirmEnable}</p>
        ) : (
          <Label className="field">
            <span>{l.newPassword}</span>
            <span className="input-shell">
              <input
                type="password"
                autoComplete="new-password"
                maxLength={1024}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </span>
          </Label>
        )}
        {actionError && (
          <p role="alert" className="error">
            {actionError === "requiredPassword" ? l.required : t[actionError]}
          </p>
        )}
        <div className="form-actions">
          <button className="primary action" disabled={actionBlocked}>
            <Save size={16} aria-hidden="true" />
            {l.confirm}
          </button>
          <button
            type="button"
            className="ui-button"
            disabled={busy}
            onClick={cancelAction}
          >
            <X size={16} aria-hidden="true" />
            {t.cancel}
          </button>
        </div>
      </form>
    </section>
  );
}
