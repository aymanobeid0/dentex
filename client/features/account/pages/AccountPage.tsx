import type { NavigationGuard } from "../../../ui/useDraftGuard";
import { translations, type Lang } from "../../../shared/i18n";
import { AccountPassword } from "../components/AccountPassword";
type AccountSummary =
  | { kind: "platform"; username: string }
  | {
      kind: "clinic";
      username: string;
      name: string;
      clinic: { name: string };
      roles: string[];
    };
export function AccountPage({
  account,
  lang,
  onExpired,
  onPasswordChanged,
  onNavigationGuardChange,
}: {
  account: AccountSummary;
  lang: Lang;
  onExpired: () => void;
  onPasswordChanged: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
}) {
  const t = translations[lang].app;
  const expire = onExpired;
  return (
    <>
      <div className="content-heading">
        <h1>{t.account}</h1>
      </div>
      <>
        <section className="card account-card">
          {account.kind === "clinic" && (
            <>
              <div>
                <span>{t.name}</span>
                <p>{account.clinic.name}</p>
              </div>
              <div>
                <span>{t.fullName}</span>
                <p>{account.name}</p>
              </div>
            </>
          )}
          <div>
            <span>{t.user}</span>
            <p>{account.username}</p>
          </div>
          {account.kind === "clinic" && (
            <div>
              <span>{t.roles}</span>
              <p>
                {account.roles
                  .map(
                    (role) =>
                      t[role as "admin" | "dentist" | "receptionist"] ?? role,
                  )
                  .join(t.roleSeparator)}
              </p>
            </div>
          )}
        </section>
        {account.kind === "clinic" && (
          <AccountPassword
            lang={lang}
            onNavigationGuardChange={onNavigationGuardChange}
            onExpired={() => expire()}
            onChanged={() => {
              onPasswordChanged();
            }}
          />
        )}
      </>
    </>
  );
}
