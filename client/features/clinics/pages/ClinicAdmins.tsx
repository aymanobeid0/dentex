import type { Clinic } from "../types";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { translations, type Lang } from "../../../shared/i18n";
import { DiscardDraftDialog } from "../../../ui/DiscardDraftDialog";
import { WriteReview } from "../../../ui/WriteReview";
import type { NavigationGuard } from "../../../ui/useDraftGuard";
import { AdminPasswordForm } from "../components/AdminPasswordForm";
import { ClinicAdminsTable } from "../components/ClinicAdminsTable";
import { useClinicAdmins } from "../hooks/useClinicAdmins";
export function ClinicAdmins({
  clinic,
  lang,
  onBack,
  onExpired,
  active = true,
  externalBusy = false,
  onBusyChange,
  onNavigationGuardChange,
}: {
  clinic: Clinic;
  lang: Lang;
  onBack: () => void;
  onExpired: () => void;
  active?: boolean;
  externalBusy?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
}) {
  const state = useClinicAdmins({
    clinic,
    lang,
    onExpired,
    active,
    externalBusy,
    onNavigationGuardChange,
  });
  const {
    t,
    admins,
    loadingError,
    selected,
    setSelected,
    password,
    setPassword,
    error,
    busy,
    saved,
    setSaved,
    load,
    reset,
  } = state;
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  const gt = translations[lang].editing,
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
      {active && (
        <>
          {(!state.query.online || state.query.stale) && (
            <p role="status">{!state.query.online ? gt.offline : gt.stale}</p>
          )}
          {state.query.isFetching && <p role="status">{gt.updating}</p>}
          <div className="content-heading">
            <h1>{t.title}</h1>
            <button
              className="language"
              onClick={() => state.guard.requestLeave(onBack)}
              disabled={busy || externalBusy}
            >
              <ArrowLeft size={16} className="directional" aria-hidden="true" />
              {t.back}
            </button>
          </div>
          <p>
            {clinic.name} · {t.code}: <bdi>{clinic.code}</bdi>
          </p>
          <WriteReview
            lang={lang}
            uncertain={r.uncertain}
            busy={
              busy ||
              externalBusy ||
              r.query.isFetching ||
              !state.query.online ||
              loadingError
            }
            failed={!!r.query.error}
            reviewed={r.reviewed}
            acknowledged={r.acknowledged}
            password
            onReview={r.review}
            onAcknowledge={r.acknowledge}
          >
            {r.reviewed &&
              r.query.data?.map((admin) => (
                <p key={admin.id}>
                  {admin.name} · <bdi>{admin.username}</bdi> ·{" "}
                  {admin.active ? t.active : t.inactive}
                </p>
              ))}
            {r.reviewed && r.query.data?.length === 0 && <p>{t.empty}</p>}
          </WriteReview>
          {selected ? (
            <>
              <AdminPasswordForm
                t={t}
                selected={selected}
                password={password}
                setPassword={setPassword}
                error={error}
                busy={busy || externalBusy}
                saveBlocked={state.saveBlocked}
                cancel={state.cancel}
                reset={reset}
              />
              {loadingError && <p role="alert">{t.error}</p>}
            </>
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
      )}
    </>
  );
}
