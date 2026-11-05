import { WriteReview } from "../../../ui/WriteReview";
import { DiscardDraftDialog } from "../../../ui/DiscardDraftDialog";
import { EditReview } from "../../../ui/EditReview";
import type { NavigationGuard } from "../../../ui/useDraftGuard";
import { translations } from "../../../shared/i18n";
import { Plus } from "lucide-react";
import { type Lang } from "../../../shared/i18n";
import { EmployeeActionForm } from "../components/EmployeeActionForm";
import { EmployeeForm } from "../components/EmployeeForm";
import { EmployeeTable } from "../components/EmployeeTable";
import { useEmployees } from "../hooks/useEmployees";
export function EmployeePage({
  lang,
  onExpired,
  onIdentityChanged,
  canManageAdmins,
  onNavigationGuardChange,
}: {
  lang: Lang;
  onExpired: () => void;
  onIdentityChanged: () => Promise<void>;
  canManageAdmins: boolean;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
}) {
  const state = useEmployees({
    lang,
    onExpired,
    onIdentityChanged,
    canManageAdmins,
    onNavigationGuardChange,
  });
  const {
    t,
    list,
    roles,
    loadError,
    editing,
    draft,
    setDraft,
    error,
    saved,
    busy,
    l,
    action,
    setAction,
    newPassword,
    setNewPassword,
    actionError,
    setActionError,
    notice,
    setNotice,
    roleName,
    load,
    open,
    submit,
    submitAction,
  } = state;
  const gt = translations[lang].editing,
    rt = translations[lang].editing;
  return (
    <>
      <DiscardDraftDialog
        open={!!state.guard.pending}
        direction={lang === "ar" ? "rtl" : "ltr"}
        title={gt.discardTitle}
        description={gt.discardHint}
        stay={gt.stay}
        discard={gt.discard}
        onStay={state.guard.stay}
        onDiscard={state.guard.discard}
        returnFocus={state.guard.returnFocus}
      />
      {(!state.online || state.stale) && (
        <p role="status">{!state.online ? rt.offline : rt.stale}</p>
      )}
      {state.updating && <p role="status">{rt.updating}</p>}
      {loadError && editing !== undefined && <p role="alert">{t.error}</p>}
      {editing && (
        <EditReview
          lang={lang}
          issue={state.saveIssue}
          changed={state.changed}
          busy={state.reviewBusy || busy || !state.online}
          failed={state.reviewFailed}
          reviewed={!!state.reviewed}
          onReview={state.review}
          onAccept={state.acceptReview}
        >
          {state.reviewed && (
            <dl>
              <dt>{t.name}</dt>
              <dd>{state.reviewed.name}</dd>
              <dt>{t.username}</dt>
              <dd>{state.reviewed.username}</dd>
              <dt>{t.roles}</dt>
              <dd>
                {state.reviewed.roles.map(roleName).join(t.roleSeparator)}
              </dd>
            </dl>
          )}
        </EditReview>
      )}
      <WriteReview
        lang={lang}
        uncertain={state.lifecycleUncertain}
        busy={
          busy || state.lifecycleReview.isFetching || !state.online || loadError
        }
        failed={!!state.lifecycleReview.error}
        reviewed={state.lifecycleReviewed}
        acknowledged={state.acknowledged}
        password={action?.kind === "reset"}
        onReview={state.reviewLifecycle}
        onAcknowledge={state.acknowledgeLifecycle}
      >
        {state.lifecycleReviewed &&
          state.lifecycleReview.data?.map((employee) => (
            <p key={employee.id}>
              {employee.name} · <bdi>{employee.username}</bdi> ·{" "}
              {employee.active ? t.active : t.inactive}
            </p>
          ))}
      </WriteReview>
      <div className="employee-heading">
        <h1>{t.title}</h1>
        {editing === undefined && !action && (
          <button
            className="primary action"
            disabled={list === null || loadError}
            onClick={() => open(null)}
          >
            <Plus size={16} aria-hidden="true" />
            {t.add}
          </button>
        )}
      </div>
      {action ? (
        <EmployeeActionForm
          t={t}
          busy={busy}
          actionBlocked={state.actionBlocked}
          cancelAction={state.cancelAction}
          l={l}
          action={action}
          setAction={setAction}
          newPassword={newPassword}
          setNewPassword={setNewPassword}
          actionError={actionError}
          setActionError={setActionError}
          submitAction={submitAction}
        />
      ) : editing !== undefined && !loadError ? (
        <EmployeeForm
          canManageAdmins={canManageAdmins}
          t={t}
          roles={roles}
          editing={editing}
          draft={draft}
          setDraft={setDraft}
          error={error}
          busy={busy}
          saveBlocked={state.saveBlocked}
          cancel={state.cancel}
          roleName={roleName}
          submit={submit}
        />
      ) : (
        <>
          <p className="success" role="status">
            {notice ? l[notice] : saved ? t.saved : ""}
          </p>
          <EmployeeTable
            canManageAdmins={canManageAdmins}
            t={t}
            list={list}
            loadError={loadError}
            l={l}
            setAction={setAction}
            setNotice={setNotice}
            roleName={roleName}
            load={load}
            open={open}
          />
        </>
      )}
    </>
  );
}
