import type { NavigationGuard } from "../../../ui/useDraftGuard";
import { DiscardDraftDialog } from "../../../ui/DiscardDraftDialog";
import { KeyRound, Save, X } from "lucide-react";
import { translations, type Lang } from "../../../shared/i18n";
import {
  Disclosure,
  DisclosureContent,
  DisclosureTrigger,
} from "../../../ui/Disclosure";
import { Label } from "../../../ui/Label";

import { useChangePassword } from "../hooks/useChangePassword";
export function AccountPassword({
  lang,
  onExpired,
  onChanged,
  onNavigationGuardChange,
}: {
  lang: Lang;
  onExpired: () => void;
  onChanged: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
}) {
  const {
    t,
    open,
    setOpen,
    current,
    setCurrent,
    next,
    setNext,
    busy,
    error,
    guard,
    saveBlocked,
    online,
    cancel,
    signInAgain,
    trigger,
    currentInput,
    submit,
  } = useChangePassword({
    lang,
    onExpired,
    onChanged,
    onNavigationGuardChange,
  });
  const gt = translations[lang].editing;
  return (
    <>
      <DiscardDraftDialog
        open={!!guard.pending}
        direction={lang === "ar" ? "rtl" : "ltr"}
        title={gt.discardTitle}
        description={gt.discardHint}
        stay={gt.stay}
        discard={gt.discard}
        onStay={guard.stay}
        onDiscard={guard.discard}
        returnFocus={guard.returnFocus}
      />
      <Disclosure open={open} onOpenChange={setOpen} asChild>
        <section className="card clinic-form account-password">
          <DisclosureTrigger asChild>
            <button ref={trigger} className="language" hidden={open}>
              <KeyRound size={16} aria-hidden="true" />
              {t.title}
            </button>
          </DisclosureTrigger>
          <DisclosureContent>
            <h2>{t.title}</h2>
            {!online && <p role="status">{gt.offline}</p>}
            <form onSubmit={submit}>
              <Label className="field">
                <span>{t.current}</span>
                <span className="input-shell">
                  <input
                    ref={currentInput}
                    type="password"
                    autoComplete="current-password"
                    maxLength={1024}
                    disabled={busy}
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                  />
                </span>
              </Label>
              <Label className="field">
                <span>{t.next}</span>
                <span className="input-shell">
                  <input
                    type="password"
                    autoComplete="new-password"
                    maxLength={1024}
                    disabled={busy}
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                  />
                </span>
              </Label>
              {error && (
                <p role="alert" className="error">
                  {t[error]}
                </p>
              )}
              {error === "uncertain" && (
                <button
                  type="button"
                  className="language"
                  disabled={busy}
                  onClick={signInAgain}
                >
                  {t.signInAgain}
                </button>
              )}
              <div className="form-actions">
                <button className="primary action" disabled={saveBlocked}>
                  <Save size={16} aria-hidden="true" />
                  {t.save}
                </button>
                <button
                  type="button"
                  className="language"
                  disabled={busy}
                  onClick={cancel}
                >
                  <X size={16} aria-hidden="true" />
                  {t.cancel}
                </button>
              </div>
            </form>
          </DisclosureContent>
        </section>
      </Disclosure>
    </>
  );
}
