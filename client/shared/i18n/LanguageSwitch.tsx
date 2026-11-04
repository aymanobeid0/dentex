import { Globe } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { translations } from "./translations";
export function LanguageSwitch() {
  const { lang, setLang } = useLanguage();
  const t = translations[lang].app;
  return (
    <button
      type="button"
      className="language"
      aria-label={t.lang}
      onClick={() => setLang(lang === "ar" ? "fr" : "ar")}
    >
      <Globe size={16} aria-hidden="true" />
      {t.switchLanguage}
    </button>
  );
}
