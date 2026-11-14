import type { Lang } from "../../shared/i18n";
export function arrivalTime(value: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-MR-u-nu-latn" : "fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Nouakchott",
    calendar: "gregory",
  }).format(new Date(value));
}
