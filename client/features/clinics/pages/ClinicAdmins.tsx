import type { Clinic } from "../types";
import { ArrowLeft } from "lucide-react";
import { type Lang } from "../../../shared/i18n";
import { AdminPasswordForm } from "../components/AdminPasswordForm";
import { ClinicAdminsTable } from "../components/ClinicAdminsTable";
import { useClinicAdmins } from "../hooks/useClinicAdmins";
export function ClinicAdmins({
  clinic,
  lang,
  onBack,
  onExpired,
}: {
  clinic: Clinic;
  lang: Lang;
  onBack: () => void;
  onExpired: () => void;
}) {
  const {
    t,
    admins,
    loadingError,
    selected,
    setSelected,
    password,
    setPassword,
    error,
    setError,
    busy,
    saved,
    setSaved,
    load,
    reset,
  } = useClinicAdmins({ clinic, lang, onExpired });
  return (
    <>
      <div className="content-heading">
        <h1>{t.title}</h1>
        <button className="language" onClick={onBack} disabled={busy}>
          <ArrowLeft size={16} className="directional" aria-hidden="true" />
          {t.back}
        </button>
      </div>
      <p>
        {clinic.name} · {t.code}: <bdi>{clinic.code}</bdi>
      </p>
      {selected ? (
        <AdminPasswordForm
          t={t}
          selected={selected}
          setSelected={setSelected}
          password={password}
          setPassword={setPassword}
          error={error}
          setError={setError}
          busy={busy}
          reset={reset}
        />
      ) : (
        <>
          <p className="success" role="status">
            {saved ? t.saved : ""}
          </p>
          <ClinicAdminsTable
            t={t}
            admins={admins}
            loadingError={loadingError}
            setSelected={setSelected}
            setSaved={setSaved}
            load={load}
          />
        </>
      )}
    </>
  );
}
