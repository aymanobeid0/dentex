import { ArrowLeft, FileText, RefreshCw, UserPlus } from "lucide-react";
import { type Lang } from "../../../shared/i18n";
import { DiscardDraftDialog } from "../../../ui/DiscardDraftDialog";
import type { NavigationGuard } from "../hooks/useRegistrationDraftGuard";
import { PatientFile } from "../components/PatientFile";
import { PatientList } from "../components/PatientList";
import { PatientRegistrationForm } from "../components/PatientRegistrationForm";
import { usePatientsPage } from "../hooks/usePatientsPage";
export function PatientPage({
  lang,
  canRead,
  canWrite,
  onExpired,
  onNavigationGuardChange,
}: {
  lang: Lang;
  canRead: boolean;
  canWrite: boolean;
  onExpired: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
}) {
  const {
    t,
    creating,
    id,
    form,
    receipt,
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
    uncertain,
    saveBlocked,
    review,
    guard,
    backToList,
  } = usePatientsPage({
    lang,
    canRead,
    canWrite,
    onExpired,
    onNavigationGuardChange,
  });
  return (
    <section className="patients-page" dir={lang === "ar" ? "rtl" : "ltr"}>
      <DiscardDraftDialog
        open={!!guard.pending}
        direction={lang === "ar" ? "rtl" : "ltr"}
        title={t.discardTitle}
        description={t.discardHint}
        stay={t.stay}
        discard={t.discard}
        onStay={guard.stay}
        onDiscard={guard.discard}
        returnFocus={guard.returnFocus}
      />
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
      {uncertain && (
        <div className="card patient-review">
          <p role="status">{canRead ? t.reviewHint : t.reviewDenied}</p>
          {canRead && (
            <button
              className="language"
              disabled={review.isFetching}
              onClick={() => void review.refetch()}
            >
              <RefreshCw size={16} aria-hidden />
              {t.reviewServer}
            </button>
          )}
          {review.isFetching && <p role="status">{t.listLoading}</p>}
          {review.isError && <p role="alert">{t.reviewFailed}</p>}
          {canRead && review.isSuccess && (
            <>
              <p role="status">
                {review.data.length ? t.reviewFound : t.reviewEmpty}
              </p>
              <ul>
                {review.data.map((item) => (
                  <li key={item.id}>
                    <a href={`#patients/${item.id}`}>
                      {item.name} — <bdi>{item.fileNumber}</bdi>
                    </a>
                  </li>
                ))}
              </ul>
            </>
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
          saveBlocked={saveBlocked}
        />
      ) : (
        <div className="card patient-empty">
          <FileText size={24} aria-hidden />
          <p>{canRead ? t.empty : t.denied}</p>
        </div>
      )}
      {canRead && (id || creating) && (
        <button className="language patient-back" onClick={backToList}>
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
