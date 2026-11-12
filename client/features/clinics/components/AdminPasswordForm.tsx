import { Save, X } from "lucide-react";
import { Label } from "../../../ui/Label";
import type { useClinicAdmins } from "../hooks/useClinicAdmins";
type Props = Pick<
  ReturnType<typeof useClinicAdmins>,
  | "t"
  | "selected"
  | "password"
  | "setPassword"
  | "error"
  | "busy"
  | "saveBlocked"
  | "cancel"
  | "reset"
>;
export function AdminPasswordForm({
  t,
  selected,
  password,
  setPassword,
  error,
  busy,
  saveBlocked,
  cancel,
  reset,
}: Props) {
  if (!selected) return null;

  return (
    <section className="card clinic-form">
      <h2>{t.reset}</h2>
      <p>
        {selected.name} · <bdi>{selected.username}</bdi>
      </p>
      <form onSubmit={reset}>
        <Label className="field">
          <span>{t.password}</span>
          <span className="input-shell">
            <input
              type="password"
              autoComplete="new-password"
              maxLength={1024}
              disabled={busy}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </span>
        </Label>
        {error && (
          <p className="error" role="alert">
            {t[error]}
          </p>
        )}
        <div className="form-actions">
          <button className="primary action" disabled={saveBlocked}>
            <Save size={16} aria-hidden="true" />
            {t.save}
          </button>
          <button
            className="ui-button"
            type="button"
            disabled={busy}
            onClick={cancel}
          >
            <X size={16} aria-hidden="true" />
            {t.cancel}
          </button>
        </div>
      </form>
    </section>
  );
}
