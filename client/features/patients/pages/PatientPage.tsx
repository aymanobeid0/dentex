import { ArrowLeft, FileText, RefreshCw, UserPlus } from "lucide-react";
import { type Lang } from "../../../shared/i18n";
import { PatientFile } from "../components/PatientFile";
import { PatientList } from "../components/PatientList";
import { PatientRegistrationForm } from "../components/PatientRegistrationForm";
import { usePatientsPage } from "../hooks/usePatientsPage";
export function PatientPage({
  lang,
  canRead,
  canWrite,
  onExpired,
}: {
  lang: Lang;
  canRead: boolean;
  canWrite: boolean;
  onExpired: () => void;
}) {
  const {
    t,
    creating,
    setCreating,
    id,
    setId,
    form,
    receipt,
    setError,
    busy,
    file,
    patient,
    loading,
    error,
    fieldErrors,
    heading,
    newPatient,
    submit,
    changeField,
  } = usePatientsPage({ lang, canRead, canWrite, onExpired });
  return (
    <section className="patients-page" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="content-heading">
        <h1 ref={heading} tabIndex={-1}>
          {id ? t.file : t.title}
        </h1>
        {canWrite && !creating && (
          <button className="language" onClick={newPatient}>
            <UserPlus size={16} aria-hidden />
            {t.new}
          </button>
        )}
      </div>
      {file.stale && (
        <p className="patient-search-feedback" role="status">
          {t.staleData}
        </p>
      )}
      {file.updating && (
        <p className="patient-search-feedback" role="status">
          {t.updating}
        </p>
      )}
      {receipt && (
        <p className="success" role="status">
          {t.saved} <bdi>{receipt}</bdi>
        </p>
      )}
      {error && (
        <div className="error" role="alert">
          <p>{t[error]}</p>
          {id && error !== "denied" && error !== "missing" && (
            <button className="language" onClick={file.reload}>
              <RefreshCw size={16} aria-hidden />
              {t.retry}
            </button>
          )}
        </div>
      )}
      {id ? (
        !canRead ? (
          <p role="alert">{t.denied}</p>
        ) : loading ? (
          <p role="status">{t.loading}</p>
        ) : (
          patient && <PatientFile lang={lang} t={t} patient={patient} />
        )
      ) : canRead && !creating ? (
        <PatientList lang={lang} onExpired={onExpired} />
      ) : canWrite ? (
        <PatientRegistrationForm
          lang={lang}
          t={t}
          form={form}
          busy={busy}
          fieldErrors={fieldErrors}
          submit={submit}
          changeField={changeField}
        />
      ) : (
        <div className="card patient-empty">
          <FileText size={24} aria-hidden />
          <p>{canRead ? t.empty : t.denied}</p>
        </div>
      )}
      {canRead && (id || creating) && (
        <button
          className="language patient-back"
          onClick={() => {
            window.location.hash = "patients";
            setId("");
            setCreating(false);
            setError("");
          }}
        >
          <ArrowLeft size={16} className="directional" aria-hidden />
          {t.backToList}
        </button>
      )}
      {id && canWrite && (
        <button className="language patient-back" onClick={newPatient}>
          <ArrowLeft size={16} className="directional" aria-hidden />
          {t.back}
        </button>
      )}
    </section>
  );
}
