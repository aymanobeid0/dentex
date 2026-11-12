import { DiscardDraftDialog } from "../../../ui/DiscardDraftDialog";
import { EditReview } from "../../../ui/EditReview";
import type { NavigationGuard } from "../../../ui/useDraftGuard";
import { translations } from "../../../shared/i18n";
import { permissionLabels } from "../components/RolePermissionEditor";
import { type Lang } from "../../../shared/i18n";
import { RolePermissionEditor } from "../components/RolePermissionEditor";
import { useRolePermissions } from "../hooks/useRolePermissions";
export function RolePermissionsPage({
  lang,
  onExpired,
  onNavigationGuardChange,
}: {
  lang: Lang;
  onExpired: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
}) {
  const state = useRolePermissions({
    lang,
    onExpired,
    onNavigationGuardChange,
  });
  const {
    t,
    roles,
    keys,
    selected,
    draft,
    setDraft,
    busy,
    error,
    saved,
    setSaved,
    load,
    role,
    choose,
    save,
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

      <h1>{t.title}</h1>
      <p className="role-intro">{t.intro}</p>
      <p className="role-intro">{t.future}</p>
      {role && (
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
            <ul>
              {state.reviewed.permissions.map((key) => (
                <li key={key}>{t[permissionLabels[key]] ?? key}</li>
              ))}
            </ul>
          )}
        </EditReview>
      )}
      {roles === null ? (
        error ? (
          <div role="alert">
            {t[error]}{" "}
            <button className="ui-button" onClick={load}>
              {t.retry}
            </button>
          </div>
        ) : (
          <p role="status">{t.loading}</p>
        )
      ) : (
        <RolePermissionEditor
          lang={lang}
          t={t}
          roles={roles}
          keys={keys}
          selected={selected}
          draft={draft}
          setDraft={setDraft}
          busy={busy}
          saveBlocked={state.saveBlocked}
          error={error}
          saved={saved}
          setSaved={setSaved}
          role={role}
          choose={choose}
          save={save}
        />
      )}
    </>
  );
}
