import { KeyRound, Save, X } from "lucide-react";
import { type Lang } from "../../../shared/i18n";
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
}: {
  lang: Lang;
  onExpired: () => void;
  onChanged: () => void;
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
    setError,
    trigger,
    currentInput,
    submit,
  } = useChangePassword({ lang, onExpired, onChanged });
  return (
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
          <form onSubmit={submit}>
            <Label className="field">
              <span>{t.current}</span>
              <span className="input-shell">
                <input
                  ref={currentInput}
                  type="password"
                  autoComplete="current-password"
                  maxLength={1024}
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
            <div className="form-actions">
              <button className="primary action" disabled={busy}>
                <Save size={16} aria-hidden="true" />
                {t.save}
              </button>
              <button
                type="button"
                className="language"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setCurrent("");
                  setNext("");
                  setError(null);
                }}
              >
                <X size={16} aria-hidden="true" />
                {t.cancel}
              </button>
            </div>
          </form>
        </DisclosureContent>
      </section>
    </Disclosure>
  );
}
