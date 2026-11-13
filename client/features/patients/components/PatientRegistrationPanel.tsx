import { type Lang } from "../../../shared/i18n";
import { DiscardDraftDialog } from "../../../ui/DiscardDraftDialog";
import type { NavigationGuard } from "../../../ui/useDraftGuard";
import { usePatientsPage } from "../hooks/usePatientsPage";
import type { RegisteredPatientForAppointment } from "../types";
import { PatientRegistrationForm } from "./PatientRegistrationForm";
import { useLayoutEffect, useRef } from 'react';

export function PatientRegistrationPanel({
  lang,
  canWrite,
  onExpired,
  onRegistered,
  onCancel,
  onNavigationGuardChange,
}: {
  lang: Lang;
  canWrite: boolean;
  onExpired: () => void;
  onRegistered: (patient: RegisteredPatientForAppointment) => void;
  onCancel: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
}) {
  const flow = usePatientsPage({
    lang,
    canRead: false,
    canWrite,
    view: { kind: "new" },
    onNavigate: () => {},
    onExpired,
    onRegistered,
    onNavigationGuardChange,
  });
  const { t, guard } = flow;
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => { panel.current?.querySelector<HTMLInputElement>('input')?.focus(); }, []);
  return (
    <section ref={panel} dir={lang === "ar" ? "rtl" : "ltr"}>
      {!canWrite && <p role="alert">{t.denied}</p>}
      {flow.error && (
        <p className="error" role="alert">
          {t[flow.error]}
        </p>
      )}
      {flow.uncertain && <p role="status">{t.reviewDenied}</p>}
      <PatientRegistrationForm
        {...flow}
        editing={false}
        saveBlocked={flow.saveBlocked || !canWrite}
      />
      <button
        type="button"
        className="ui-button"
        disabled={flow.busy}
        onClick={() => guard.requestLeave(onCancel)}
      >
        {t.cancelEdit}
      </button>
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
    </section>
  );
}
