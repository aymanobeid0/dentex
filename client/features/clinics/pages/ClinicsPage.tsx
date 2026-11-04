import { Plus } from "lucide-react";
import { useEffect } from "react";
import { type Lang } from "../../../shared/i18n";
import { ClinicForm } from "../components/ClinicForm";
import { ClinicsTable } from "../components/ClinicsTable";
import { useClinics } from "../hooks/useClinics";
import { ClinicAdmins } from "./ClinicAdmins";
export function ClinicsPage({
  lang,
  onExpired,
  active = true,
  externalBusy = false,
  onBusyChange,
}: {
  lang: Lang;
  onExpired: () => void;
  active?: boolean;
  externalBusy?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const {
    t,
    busy: saving,
    adminClinic,
    setAdminClinic,
    clinics,
    loadError,
    creating,
    setCreating,
    clinicForm,
    setClinicForm,
    fieldErrors,
    setFieldErrors,
    createError,
    setCreateError,
    created,
    setCreated,
    createClinic,
    loadClinics,
  } = useClinics({ lang, onExpired });
  useEffect(() => {
    onBusyChange?.(saving);
  }, [saving, onBusyChange]);
  const busy = saving || externalBusy;
  if (!active) return null;
  if (adminClinic)
    return (
      <ClinicAdmins
        clinic={adminClinic}
        lang={lang}
        onBack={() => setAdminClinic(null)}
        onExpired={onExpired}
      />
    );
  return (
    <>
      <div className="content-heading">
        <h1>{t.dashboard}</h1>
        {!creating && (
          <button
            className="primary action"
            onClick={() => {
              setCreating(true);
              setCreated(false);
            }}
          >
            <Plus size={16} aria-hidden="true" />
            {t.create}
          </button>
        )}
      </div>
      {creating ? (
        <ClinicForm
          t={t}
          busy={busy}
          setCreating={setCreating}
          clinicForm={clinicForm}
          setClinicForm={setClinicForm}
          fieldErrors={fieldErrors}
          setFieldErrors={setFieldErrors}
          createError={createError}
          setCreateError={setCreateError}
          createClinic={createClinic}
        />
      ) : (
        <>
          <p role="status" className="success">
            {created ? t.created : ""}
          </p>
          <ClinicsTable
            t={t}
            setAdminClinic={setAdminClinic}
            clinics={clinics}
            loadError={loadError}
            loadClinics={loadClinics}
          />
        </>
      )}
    </>
  );
}
