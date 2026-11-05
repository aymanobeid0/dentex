import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { translations, type Lang } from "../../../shared/i18n";
import { DiscardDraftDialog } from "../../../ui/DiscardDraftDialog";
import { WriteReview } from "../../../ui/WriteReview";
import type { NavigationGuard } from "../../../ui/useDraftGuard";
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
  onNavigationGuardChange,
}: {
  lang: Lang;
  onExpired: () => void;
  active?: boolean;
  externalBusy?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
}) {
  const state = useClinics({ lang, onExpired, active, externalBusy });
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
  } = state;
  const [adminBusy, setAdminBusy] = useState(false),
    adminGuard = useRef<NavigationGuard | null>(null);
  const registerAdminGuard = useCallback((guard: NavigationGuard | null) => {
    adminGuard.current = guard;
  }, []);
  const leave = useCallback<NavigationGuard>(
    (next) =>
      adminGuard.current
        ? adminGuard.current(next)
        : state.guard.requestLeave(next),
    [state.guard.requestLeave],
  );
  useEffect(() => {
    onNavigationGuardChange?.(leave);
    return () => onNavigationGuardChange?.(null);
  }, [leave, onNavigationGuardChange]);
  useEffect(() => {
    onBusyChange?.(saving || adminBusy);
    return () => onBusyChange?.(false);
  }, [saving, adminBusy, onBusyChange]);
  const busy = saving || externalBusy,
    gt = translations[lang].editing,
    r = state.recovery;
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
      {adminClinic ? (
        <ClinicAdmins
          key={adminClinic.id}
          clinic={adminClinic}
          lang={lang}
          active={active}
          externalBusy={externalBusy}
          onBusyChange={setAdminBusy}
          onNavigationGuardChange={registerAdminGuard}
          onBack={() => setAdminClinic(null)}
          onExpired={onExpired}
        />
      ) : active ? (
        <>
          {(!state.query.online || state.query.stale) && (
            <p role="status">{!state.query.online ? gt.offline : gt.stale}</p>
          )}
          {state.query.isFetching && <p role="status">{gt.updating}</p>}
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
          <WriteReview
            lang={lang}
            uncertain={r.uncertain}
            busy={
              busy || r.query.isFetching || !state.query.online || loadError
            }
            failed={!!r.query.error}
            reviewed={r.reviewed}
            acknowledged={r.acknowledged}
            onReview={r.review}
            onAcknowledge={r.acknowledge}
          >
            {r.reviewed &&
              r.query.data?.map((clinic) => (
                <p key={clinic.id}>
                  {clinic.name} · <bdi>{clinic.code}</bdi>
                </p>
              ))}
            {r.reviewed && r.query.data?.length === 0 && <p>{t.empty}</p>}
          </WriteReview>
          {creating ? (
            <>
              <ClinicForm
                t={t}
                busy={busy}
                saveBlocked={state.saveBlocked}
                cancel={state.cancel}
                clinicForm={clinicForm}
                setClinicForm={setClinicForm}
                fieldErrors={fieldErrors}
                setFieldErrors={setFieldErrors}
                createError={createError}
                createClinic={createClinic}
              />
              {loadError && <p role="alert">{t.network}</p>}
            </>
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
      ) : null}
    </>
  );
}
