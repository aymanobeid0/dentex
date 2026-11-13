import { ArrowLeft, FileText, RefreshCw, UserPlus } from "lucide-react";
import { type Lang } from "../../../shared/i18n";
import { DiscardDraftDialog } from "../../../ui/DiscardDraftDialog";
import { CheckField } from "../../../ui/CheckField";
import { ConfirmDialog } from "../../../ui/ConfirmDialog";
import type { NavigationGuard } from "../hooks/useRegistrationDraftGuard";
import { PatientFile } from "../components/PatientFile";
import { PatientList } from "../components/PatientList";
import { PatientRegistrationForm } from "../components/PatientRegistrationForm";
import { usePatientsPage } from "../hooks/usePatientsPage";
import { OldNumberLookup } from "../components/OldNumberLookup";
import type { PatientView } from "../types";
import type { ReactNode } from "react";
export type PatientAppointmentContext = {
  id: string;
  name: string;
  fileNumber: string;
  archived: boolean;
};
type Props = {
  renderAppointments?: (patient: PatientAppointmentContext) => ReactNode;
  lang: Lang;
  canRead: boolean;
  canLookupOldNumber?: boolean;
  canWrite: boolean;
  view: PatientView;
  onNavigate: (view: PatientView) => void;
  onExpired: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
};
export function PatientPage(props: Props) {
  const { view } = props;
  return (
    <PatientFlow
      key={view.kind === "file" ? `file:${view.patientId}` : view.kind}
      {...props}
    />
  );
}
function PatientFlow({
  renderAppointments,
  view,
  onNavigate,
  lang,
  canRead,
  canLookupOldNumber = false,
  canWrite,
  onExpired,
  onNavigationGuardChange,
}: Props) {
  const {
    t,
    creating,
    id,
    form,
    receipt,
    savedEdit,
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
    editing,
    edit,
    editIssue,
    startEditing,
    acknowledgeEditReview,
    editChanged,
    cancelEditing,
    archiveAction,
    archiveOpen,
    archiveIssue,
    archiveFocus,
    startArchive,
    cancelArchive,
    submitArchive,
    archiveReviewed,
    acknowledgeArchiveReview,
    archiveBlocked,
  } = usePatientsPage({
    view,
    onNavigate,
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
      <ConfirmDialog
        open={archiveOpen && !!archiveAction && !guard.pending}
        direction={lang === "ar" ? "rtl" : "ltr"}
        title={archiveAction?.archived ? t.archive : t.restore}
        description={
          archiveAction?.archived ? t.archiveConfirmHint : t.restoreConfirmHint
        }
        cancel={t.cancelEdit}
        confirm={archiveAction?.archived ? t.confirmArchive : t.confirmRestore}
        onCancel={cancelArchive}
        onConfirm={() => void submitArchive()}
        busy={busy}
        blocked={archiveBlocked}
        returnFocus={archiveFocus}
      >
        {busy && <p role="status">{t.loading}</p>}
        {archiveIssue && (
          <div>
            <p role="alert">
              {archiveIssue === "uncertain"
                ? t.archiveUncertain
                : t[archiveIssue]}
            </p>
            <button
              className="ui-button"
              disabled={edit.review.isFetching || !canRead}
              onClick={() => {
                void edit.review.refetch();
              }}
            >
              {t.reviewFile}
            </button>
            {edit.review.isFetching && <p role="status">{t.loading}</p>}
            {edit.review.isError && <p role="alert">{t.reviewFailed}</p>}
            {edit.review.isSuccess &&
              !edit.review.isFetching &&
              canRead &&
              patient && (
                <>
                  <PatientFile lang={lang} t={t} patient={edit.review.data} />
                  <CheckField
                    checked={archiveReviewed}
                    onCheckedChange={acknowledgeArchiveReview}
                  >
                    {edit.review.data.archived === archiveAction?.archived
                      ? t.acceptCurrentStatus
                      : t.continueSaving}
                  </CheckField>
                </>
              )}
          </div>
        )}
      </ConfirmDialog>
      <div className="content-heading">
        <h1 ref={heading} tabIndex={-1}>
          {id ? t.file : t.title}
        </h1>
        <div className="heading-actions">
          {canLookupOldNumber && canRead && !creating && !id && (
            <OldNumberLookup
              lang={lang}
              onExpired={onExpired}
              onNavigate={onNavigate}
            />
          )}
          {canRead && (id || creating) && (
            <button className="ui-button" onClick={backToList}>
              <ArrowLeft size={16} className="directional" aria-hidden />
              {t.backToList}
            </button>
          )}
          {canWrite && !creating && !id && (
            <button className="primary action" onClick={newPatient}>
              <UserPlus size={16} aria-hidden />
              {t.new}
            </button>
          )}
        </div>
      </div>
      {file.stale && (
        <p className="patient-search-feedback" role="status">
          {t.staleData}
        </p>
      )}
      {!patient && archiveAction && archiveIssue && !archiveOpen && canRead && (
        <button className="ui-button" onClick={startArchive}>
          {t.reviewFile}
        </button>
      )}
      {file.updating && (
        <p className="patient-search-feedback" role="status">
          {t.updating}
        </p>
      )}
      {receipt && (
        <p className="success" role="status">
          {savedEdit ? t.edited : t.saved} <bdi>{receipt}</bdi>
        </p>
      )}
      {error && (
        <div className="error" role="alert">
          <p>{editing && error === "uncertain" ? t.editUncertain : t[error]}</p>
          {id && error !== "denied" && error !== "missing" && (
            <button className="ui-button" onClick={file.reload}>
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
              className="ui-button"
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
                    <button
                      type="button"
                      className="ui-link patient-link"
                      onClick={() =>
                        onNavigate({ kind: "file", patientId: item.id })
                      }
                    >
                      {item.name} — <bdi>{item.fileNumber}</bdi>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {editing && canRead && patient ? (
        <>
          {patient.archived && <p role="alert">{t.archivedHint}</p>}
          {editChanged && <p role="status">{t.changed}</p>}
          {(editIssue || editChanged) && (
            <div className="card patient-review">
              <p>{t.editReviewHint}</p>
              <button
                className="ui-button"
                disabled={edit.review.isFetching}
                onClick={() => void edit.review.refetch()}
              >
                {t.reviewFile}
              </button>
              {edit.review.isFetching && <p role="status">{t.loading}</p>}
              {edit.review.isError && <p role="alert">{t.reviewFailed}</p>}
              {edit.review.isSuccess && !edit.review.isFetching && (
                <>
                  <PatientFile lang={lang} t={t} patient={edit.review.data} />
                  <CheckField
                    checked={false}
                    onCheckedChange={acknowledgeEditReview}
                  >
                    {t.continueSaving}
                  </CheckField>
                </>
              )}
            </div>
          )}
          <PatientRegistrationForm
            lang={lang}
            t={t}
            form={form}
            busy={busy}
            fieldErrors={fieldErrors}
            submit={submit}
            changeField={changeField}
            saveBlocked={saveBlocked || !canWrite}
            editing
          />
          <button
            className="ui-button patient-back"
            disabled={busy}
            onClick={cancelEditing}
          >
            {t.cancelEdit}
          </button>
        </>
      ) : id ? (
        !canRead ? (
          <p role="alert">{t.denied}</p>
        ) : loading ? (
          <p role="status">{t.loading}</p>
        ) : (
          patient && (
            <>
              <PatientFile
                lang={lang}
                t={t}
                patient={patient}
                canWrite={canWrite}
                onEdit={startEditing}
                onArchive={startArchive}
              />
              {renderAppointments?.({
                id: patient.id,
                name: patient.name,
                fileNumber: patient.fileNumber,
                archived: patient.archived,
              })}
              {patient.archived && <p role="status">{t.archivedHint}</p>}
            </>
          )
        )
      ) : canRead && !creating ? (
        <PatientList
          lang={lang}
          onExpired={onExpired}
          onNavigate={onNavigate}
        />
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
    </section>
  );
}
