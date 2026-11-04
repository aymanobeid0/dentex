import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Lang } from './locales';

const LanguageContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void } | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => localStorage.getItem('dentex-lang') === 'fr' ? 'fr' : 'ar');
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('dentex-lang', lang);
  }, [lang]);
  return <LanguageContext value={{ lang, setLang }}>{children}</LanguageContext>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('LanguageProvider is required');
  return value;
}
