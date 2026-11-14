import type { Lang } from "../../shared/i18n";
import { treatmentCopy } from "./treatments.copy";
export function TreatmentHistoryValues({
  value,
  lang,
}: {
  value: unknown;
  lang: Lang;
}) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>,
    t = treatmentCopy[lang];
  const keys = ["title", "description", "location", "notes", "status"] as const;
  return (
    <dl>
      {keys.map((key) => {
        const v = row[key];
        if (typeof v !== "string" || !v) return null;
        const label =
          key === "title"
            ? t.planName
            : key === "status"
              ? lang === "ar"
                ? "الحالة"
                : "État"
              : t[key];
        const text =
          key === "status" && ["pending", "cancelled", "active"].includes(v)
            ? t[v as "pending" | "cancelled" | "active"]
            : v;
        return (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{text}</dd>
          </div>
        );
      })}
    </dl>
  );
}
