import type { ReactNode } from "react";
import { translations, type Lang } from "../shared/i18n";
export function EditReview({
  lang,
  issue,
  changed,
  busy,
  failed,
  reviewed,
  onReview,
  onAccept,
  children,
}: {
  lang: Lang;
  issue: "conflict" | "uncertain" | null;
  changed: boolean;
  busy: boolean;
  failed: boolean;
  reviewed: boolean;
  onReview: () => void;
  onAccept: (keep: boolean) => void;
  children: ReactNode;
}) {
  const t = translations[lang].editing;
  if (!issue && !changed && !reviewed && !failed) return null;
  return (
    <section aria-label={t.review}>
      <p role="alert" className="error">
        {issue ? t[issue] : changed ? t.changed : ""}
      </p>
      <button
        type="button"
        className="language"
        disabled={busy}
        onClick={onReview}
      >
        {t.review}
      </button>
      {failed && (
        <p role="alert" className="error">
          {t.reviewError}
        </p>
      )}
      {reviewed && (
        <>
          <p>{t.reviewHint}</p>
          {children}
          <div className="form-actions">
            <button
              type="button"
              className="language"
              disabled={busy}
              onClick={() => onAccept(false)}
            >
              {t.useLatest}
            </button>
            <button
              type="button"
              className="language"
              disabled={busy}
              onClick={() => onAccept(true)}
            >
              {t.keepDraft}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
