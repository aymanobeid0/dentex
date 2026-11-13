import type { ReactNode } from "react";
import { translations, type Lang } from "../shared/i18n";

/** Recovery for writes whose reply could not confirm the outcome. */
export function WriteReview({
  lang,
  uncertain,
  busy,
  failed,
  reviewed,
  acknowledged,
  password = false,
  onReview,
  onAcknowledge,
  children,
}: {
  lang: Lang;
  uncertain: boolean;
  busy: boolean;
  failed: boolean;
  reviewed: boolean;
  acknowledged: boolean;
  password?: boolean;
  onReview: () => void;
  onAcknowledge: () => void;
  children: ReactNode;
}) {
  const t = translations[lang].writes;
  if (!uncertain) return null;
  return (
    <section aria-label={t.review}>
      <p className="error" role="alert">
        {t.uncertain}
      </p>
      <p>{password ? t.passwordHint : t.createHint}</p>
      <button
        type="button"
        className="ui-button"
        disabled={busy}
        onClick={onReview}
      >
        {t.review}
      </button>
      {failed && (
        <p className="error" role="alert">
          {t.reviewError}
        </p>
      )}
      {reviewed && (
        <>
          {children}
          <button
            type="button"
            className="ui-button"
            disabled={busy || acknowledged}
            onClick={onAcknowledge}
          >
            {t.acknowledge}
          </button>
        </>
      )}
    </section>
  );
}
