import type { ReactNode } from "react";
import { SessionProvider, type Session } from "../features/auth";
import { LanguageProvider, useLanguage } from "../shared/i18n";
import { UiProvider } from "../ui/UiProvider";
function Direction({ children }: { children: ReactNode }) {
  const { lang } = useLanguage();
  return (
    <UiProvider direction={lang === "ar" ? "rtl" : "ltr"}>
      {children}
    </UiProvider>
  );
}
export function AppProviders({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  return (
    <LanguageProvider>
      <SessionProvider session={session}>
        <Direction>{children}</Direction>
      </SessionProvider>
    </LanguageProvider>
  );
}
