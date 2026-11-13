import { Save } from "lucide-react";
import { translations } from "../../../shared/i18n";
import { CheckField } from "../../../ui/CheckField";
import { ToggleGroup, ToggleGroupItem } from "../../../ui/ToggleGroup";
import type { useRolePermissions } from "../hooks/useRolePermissions";
export const permissionLabels: Record<
  string,
  keyof typeof translations.ar.roles
> = {
  "employees.manage": "employees",
  "patients.read": "patientsRead",
  "patients.write": "patientsWrite",
  "patient_records.read": "recordsRead",
  "patient_records.write": "recordsWrite",
  "dental_chart.read": "chartRead",
  "dental_chart.write": "chartWrite",
  "appointments.read": "appointmentsRead",
  "appointments.write": "appointmentsWrite",
  "prescriptions.read": "prescriptionsRead",
  "prescriptions.write": "prescriptionsWrite",
  "communications.read": "communicationsRead",
  "communications.write": "communicationsWrite",
  "invoices.read": "invoicesRead",
  "invoices.write": "invoicesWrite",
  "payments.read": "paymentsRead",
  "payments.write": "paymentsWrite",
  "patient_financial.read": "financialRead",
};
type Props = Pick<
  ReturnType<typeof useRolePermissions>,
  | "lang"
  | "t"
  | "roles"
  | "keys"
  | "selected"
  | "draft"
  | "setDraft"
  | "saveBlocked"
  | "busy"
  | "error"
  | "saved"
  | "setSaved"
  | "role"
  | "choose"
  | "save"
>;
export function RolePermissionEditor({
  lang,
  t,
  roles,
  keys,
  selected,
  draft,
  setDraft,
  busy,
  saveBlocked,
  error,
  saved,
  setSaved,
  role,
  choose,
  save,
}: Props) {
  if (!roles) return null;

  return (
    <section className="card role-card">
      <ToggleGroup
        type="single"
        value={selected}
        onValueChange={(id) => {
          const next = roles.find((item) => item.id === id);
          if (next) choose(next);
        }}
        disabled={busy}
        dir={lang === "ar" ? "rtl" : "ltr"}
        className="role-tabs"
        aria-label={t.title}
      >
        {roles.map((r) => (
          <ToggleGroupItem
            key={r.id}
            value={r.id}
            className={"ui-button " + (selected === r.id ? "role-selected" : "")}
          >
            {t[r.key as "admin" | "dentist" | "receptionist"] ?? r.key}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {role?.key === "admin" && <p className="role-intro">{t.adminNote}</p>}
      <fieldset
        className="permission-grid"
        disabled={busy || role?.key === "admin"}
      >
        <legend>{t.title}</legend>
        {keys.map((key) => (
          <CheckField
            key={key}
            disabled={busy || role?.key === "admin"}
            checked={draft.includes(key)}
            onCheckedChange={(checked) => {
              setDraft(
                checked ? [...draft, key] : draft.filter((k) => k !== key),
              );
              setSaved(false);
            }}
          >
            {t[permissionLabels[key]] ?? key}
          </CheckField>
        ))}
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {t[error]}
        </p>
      )}
      <p className="success" role="status">
        {saved ? t.saved : ""}
      </p>
      {role?.key !== "admin" && (
        <button
          type="button"
          className="primary action"
          disabled={saveBlocked}
          onClick={save}
        >
          <Save size={16} aria-hidden="true" />
          {t.save}
        </button>
      )}
    </section>
  );
}
