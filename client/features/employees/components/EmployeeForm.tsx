import { emptyEmployeeDraft } from "../types";
import { Save, X } from "lucide-react";
import { CheckField } from "../../../ui/CheckField";
import { Label } from "../../../ui/Label";
import type { useEmployees } from "../hooks/useEmployees";
type Props = Pick<
  ReturnType<typeof useEmployees>,
  | "canManageAdmins"
  | "t"
  | "roles"
  | "editing"
  | "setEditing"
  | "draft"
  | "setDraft"
  | "error"
  | "setError"
  | "busy"
  | "roleName"
  | "submit"
>;
export function EmployeeForm({
  canManageAdmins,
  t,
  roles,
  editing,
  setEditing,
  draft,
  setDraft,
  error,
  setError,
  busy,
  roleName,
  submit,
}: Props) {
  return (
    <section className="card clinic-form">
      <h2>{editing ? t.edit : t.add}</h2>
      <form onSubmit={submit} noValidate>
        <Label className="field">
          <span>{t.name}</span>
          <span className="input-shell">
            <input
              maxLength={200}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </span>
        </Label>
        <Label className="field">
          <span>{t.username}</span>
          <span className="input-shell">
            <input
              maxLength={200}
              autoComplete="off"
              value={draft.username}
              onChange={(e) => setDraft({ ...draft, username: e.target.value })}
            />
          </span>
        </Label>
        {!editing && (
          <Label className="field">
            <span>{t.password}</span>
            <span className="input-shell">
              <input
                type="password"
                maxLength={1024}
                autoComplete="new-password"
                value={draft.password}
                onChange={(e) =>
                  setDraft({ ...draft, password: e.target.value })
                }
              />
            </span>
          </Label>
        )}
        <fieldset className="role-options">
          <legend>{t.roles}</legend>
          {roles.map((role) => (
            <CheckField
              key={role.id}
              disabled={!canManageAdmins && role.key === "admin"}
              checked={draft.roleIds.includes(role.id)}
              onCheckedChange={(checked) =>
                setDraft({
                  ...draft,
                  roleIds: checked
                    ? [...draft.roleIds, role.id]
                    : draft.roleIds.filter((id) => id !== role.id),
                })
              }
            >
              {roleName(role)}
            </CheckField>
          ))}
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {t[error]}
          </p>
        )}
        <div className="form-actions">
          <button className="primary action" disabled={busy}>
            <Save size={16} aria-hidden="true" />
            {t.save}
          </button>
          <button
            type="button"
            className="language"
            disabled={busy}
            onClick={() => {
              setEditing(undefined);
              setDraft(emptyEmployeeDraft());
              setError(null);
            }}
          >
            <X size={16} aria-hidden="true" />
            {t.cancel}
          </button>
        </div>
      </form>
    </section>
  );
}
