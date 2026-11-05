import { type ClinicDraft } from "../types";
import { Save, X } from "lucide-react";
import { Label } from "../../../ui/Label";
import type { useClinics } from "../hooks/useClinics";
type Props = Pick<
  ReturnType<typeof useClinics>,
  | "t"
  | "busy"
  | "saveBlocked"
  | "cancel"
  | "clinicForm"
  | "setClinicForm"
  | "fieldErrors"
  | "setFieldErrors"
  | "createError"
  | "createClinic"
>;
export function ClinicForm({
  t,
  busy,
  saveBlocked,
  cancel,
  clinicForm,
  setClinicForm,
  fieldErrors,
  setFieldErrors,
  createError,
  createClinic,
}: Props) {
  function clinicField(key: keyof ClinicDraft, label: string) {
    const errorKey = fieldErrors[key];
    return (
      <Label className="field">
        <span>{label}</span>
        <span className="input-shell">
          <input
            type={key === "managerPassword" ? "password" : "text"}
            dir={key === "code" ? "ltr" : undefined}
            inputMode={key === "code" ? "numeric" : undefined}
            maxLength={
              key === "code" ? 4 : key === "managerPassword" ? 1024 : 200
            }
            autoComplete={key === "managerPassword" ? "new-password" : "off"}
            disabled={busy}
            value={clinicForm[key]}
            onChange={(e) => {
              setClinicForm({ ...clinicForm, [key]: e.target.value });
              setFieldErrors({ ...fieldErrors, [key]: undefined });
            }}
            aria-invalid={!!errorKey}
            aria-describedby={errorKey ? `${key}-error` : undefined}
          />
        </span>
        {errorKey && (
          <small className="field-error" id={`${key}-error`}>
            {t[errorKey]}
          </small>
        )}
      </Label>
    );
  }
  return (
    <section className="card clinic-form">
      <h2>{t.create}</h2>
      <form onSubmit={createClinic} noValidate>
        {clinicField("name", t.name)}
        {clinicField("code", t.code)}
        {clinicField("managerName", t.managerName)}
        {clinicField("managerUsername", t.managerUsername)}
        {clinicField("managerPassword", t.managerPassword)}
        {createError && (
          <p role="alert" className="error">
            {t[createError as "network" | "createError"]}
          </p>
        )}
        <div className="form-actions">
          <button className="primary action" disabled={saveBlocked}>
            <Save size={16} aria-hidden="true" />
            {t.save}
          </button>
          <button
            type="button"
            className="language"
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
