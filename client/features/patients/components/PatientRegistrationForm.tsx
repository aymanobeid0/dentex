import { Save, UserPlus } from "lucide-react";
import { CheckField } from "../../../ui/CheckField";
import { Label } from "../../../ui/Label";
import { SelectField } from "../../../ui/SelectField";
import type { usePatientsPage } from "../hooks/usePatientsPage";
type Props = Pick<
  ReturnType<typeof usePatientsPage>,
  "lang" | "t" | "form" | "busy" | "fieldErrors" | "submit" | "changeField"
>;
export function PatientRegistrationForm({
  lang,
  t,
  form,
  busy,
  fieldErrors,
  submit,
  changeField,
}: Props) {
  const field = (key: "name" | "phone" | "birthDate" | "address") => (
    <Label className="field" htmlFor={`patient-${key}`}>
      <span id={`patient-${key}-label`}>
        {t[key]}{" "}
        <small aria-hidden="true">
          {key === "name" || key === "phone" ? "*" : `(${t.optional})`}
        </small>
      </span>
      <span className="input-shell">
        <input
          id={`patient-${key}`}
          aria-labelledby={`patient-${key}-label`}
          type={key === "birthDate" ? "date" : key === "phone" ? "tel" : "text"}
          dir={key === "phone" || key === "birthDate" ? "ltr" : undefined}
          required={key === "name" || key === "phone"}
          maxLength={
            key === "name"
              ? 200
              : key === "phone"
                ? 80
                : key === "address"
                  ? 500
                  : undefined
          }
          max={
            key === "birthDate"
              ? new Date().toISOString().slice(0, 10)
              : undefined
          }
          value={form[key]}
          onChange={(event) => changeField(key, event.target.value)}
          aria-invalid={!!fieldErrors[key]}
          aria-describedby={
            fieldErrors[key]
              ? `patient-${key}-error`
              : key === "phone"
                ? "patient-phone-hint"
                : undefined
          }
        />
      </span>
      {fieldErrors[key] && (
        <small className="field-error" id={`patient-${key}-error`}>
          {t[fieldErrors[key]!]}
        </small>
      )}
      {key === "phone" && (
        <small id="patient-phone-hint" className="patient-hint">
          {t.phoneHint}
        </small>
      )}
    </Label>
  );
  return (
    <section className="card patient-form">
      <h2>
        <UserPlus size={18} aria-hidden />
        {t.new}
      </h2>
      <p className="patient-hint">* {t.required}</p>
      <form onSubmit={submit} noValidate>
        <fieldset disabled={busy} className="patient-fields">
          <div className="patient-grid">
            {field("name")}
            {field("phone")}
            <Label className="field" htmlFor="patient-gender">
              <span id="patient-gender-label">
                {t.gender} <small aria-hidden="true">*</small>
              </span>
              <SelectField
                id="patient-gender"
                labelledBy="patient-gender-label"
                direction={lang === "ar" ? "rtl" : "ltr"}
                invalid={!!fieldErrors.gender}
                describedBy={
                  fieldErrors.gender ? "patient-gender-error" : undefined
                }
                required
                disabled={busy}
                value={form.gender}
                onValueChange={(value) => changeField("gender", value)}
                placeholder={t.choose}
                options={[
                  { value: "male", label: t.male },
                  { value: "female", label: t.female },
                ]}
              />
              {fieldErrors.gender && (
                <small className="field-error" id="patient-gender-error">
                  {t[fieldErrors.gender]}
                </small>
              )}
            </Label>
            {field("birthDate")}
            {field("address")}
          </div>
          <CheckField
            className="patient-check"
            checked={form.isChild}
            disabled={busy}
            onCheckedChange={(checked) => changeField("isChild", checked)}
          >
            {t.child}
          </CheckField>
          <p className="patient-hint">{t.childHint}</p>
          <Label className="field" htmlFor="patient-note">
            <span>
              {t.administrativeNote} <small>({t.optional})</small>
            </span>
            <textarea
              id="patient-note"
              maxLength={2000}
              rows={3}
              value={form.administrativeNote}
              onChange={(event) =>
                changeField("administrativeNote", event.target.value)
              }
            />
          </Label>
          <button className="primary action" disabled={busy}>
            <Save size={16} aria-hidden />
            {t.register}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
