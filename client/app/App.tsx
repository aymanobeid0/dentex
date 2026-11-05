import { useCallback, useEffect, useRef, useState } from "react";
import "../../design-tokens.css";
import { AccountPage } from "../features/account";
import { LoginPage, Session, useIdentity, useLogout } from "../features/auth";
import { ClinicsPage } from "../features/clinics";
import { EmployeePage } from "../features/employees";
import { PatientPage } from "../features/patients";
import { RolePermissionsPage } from "../features/roles";
import { LanguageSwitch, translations, useLanguage } from "../shared/i18n";
import { AppProviders } from "./AppProviders";
import { AppShell } from "./layout/AppShell";
import type { Page } from "./navigation";
import "./styles.css";
export function App() {
  const [session, setSession] = useState(
    () => new Session((next) => setSession(next)),
  );
  const [passwordChanged, setPasswordChanged] = useState(false);
  return (
    <AppProviders session={session}>
      <SessionApp
        key={session.id}
        session={session}
        passwordChanged={passwordChanged}
        setPasswordChanged={setPasswordChanged}
      />
    </AppProviders>
  );
}
function SessionApp({
  session,
  passwordChanged,
  setPasswordChanged,
}: {
  session: Session;
  passwordChanged: boolean;
  setPasswordChanged: (value: boolean) => void;
}) {
  const { lang } = useLanguage(),
    t = translations[lang].app;
  const { account, boot, stale, failed } = useIdentity(session);
  const expire = () => session.replace(null);
  const { busy, error, logout } = useLogout(expire);
  const [page, setPage] = useState<Page>("clinics");
  const [clinicBusy, setClinicBusy] = useState(false);
  const patientNavigationGuard = useRef<((leave: () => void) => void) | null>(
    null,
  );
  const registerPatientGuard = useCallback(
    (guard: ((leave: () => void) => void) | null) => {
      patientNavigationGuard.current = guard;
    },
    [],
  );
  const navigate = (leave: () => void) =>
    patientNavigationGuard.current
      ? patientNavigationGuard.current(leave)
      : leave();
  const admin = account?.kind === "clinic" && account.roles.includes("admin");
  const canManageEmployees =
    account?.kind === "clinic" &&
    (admin || account.permissions.includes("employees.manage"));
  const canReadPatients =
    account?.kind === "clinic" &&
    (admin || account.permissions.includes("patients.read"));
  const canWritePatients =
    account?.kind === "clinic" &&
    (admin || account.permissions.includes("patients.write"));
  useEffect(() => {
    if (account?.kind === "platform") setPage("clinics");
    else if (account?.kind === "clinic")
      setPage(
        window.location.hash.startsWith("#patients") ? "patients" : "account",
      );
  }, [account?.kind]);
  useEffect(() => {
    const open = () => {
      if (
        account?.kind === "clinic" &&
        window.location.hash.startsWith("#patients")
      )
        navigate(() => setPage("patients"));
    };
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [account?.kind]);
  useEffect(() => {
    if (
      account?.kind === "clinic" &&
      ((page === "employees" && !canManageEmployees) ||
        (page === "rolePermissions" && !admin) ||
        (page === "patients" && !canReadPatients && !canWritePatients))
    )
      setPage("account");
  }, [
    account?.kind,
    page,
    canManageEmployees,
    admin,
    canReadPatients,
    canWritePatients,
  ]);
  if ((failed || stale) && !account)
    return (
      <main className="login">
        <LanguageSwitch />
        <p role="alert">{t.network}</p>
        <button
          className="language"
          onClick={() => void session.refresh().catch(() => {})}
        >
          {t.retry}
        </button>
      </main>
    );
  if (boot)
    return (
      <p className="boot" role="status">
        {t.loading}
      </p>
    );
  if (!account)
    return (
      <LoginPage
        passwordChanged={passwordChanged}
        onAuthenticated={(next) => session.replace(next)}
        onLoggedIn={() => setPasswordChanged(false)}
      />
    );
  return (
    <AppShell
      lang={lang}
      page={page}
      onNavigate={(next) => {
        if (next === page) return;
        // Platform screens stay mounted, retaining their drafts on account visits.
        if (account.kind === "platform") setPage(next);
        else navigate(() => setPage(next));
      }}
      kind={account.kind}
      canManageEmployees={canManageEmployees}
      isAdmin={admin}
      canAccessPatients={canReadPatients || canWritePatients}
      busy={busy || clinicBusy}
      onLogout={() => navigate(logout)}
    >
      {stale && (
        <p role="status" className="error">
          {t.staleIdentity}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error === "uncertain" ? t.uncertain : t.network}
        </p>
      )}
      {account.kind === "platform" && (
        <ClinicsPage
          lang={lang}
          onExpired={expire}
          active={page === "clinics"}
          externalBusy={busy}
          onBusyChange={setClinicBusy}
          onNavigationGuardChange={registerPatientGuard}
        />
      )}
      {page === "patients" &&
      account.kind === "clinic" &&
      (canReadPatients || canWritePatients) ? (
        <PatientPage
          lang={lang}
          canRead={canReadPatients}
          canWrite={canWritePatients}
          onExpired={expire}
          onNavigationGuardChange={registerPatientGuard}
        />
      ) : page === "employees" &&
        account.kind === "clinic" &&
        canManageEmployees ? (
        <EmployeePage
          lang={lang}
          onNavigationGuardChange={registerPatientGuard}
          canManageAdmins={admin}
          onExpired={expire}
          onIdentityChanged={() => session.refresh()}
        />
      ) : page === "rolePermissions" && admin ? (
        <RolePermissionsPage
          lang={lang}
          onExpired={expire}
          onNavigationGuardChange={registerPatientGuard}
        />
      ) : account.kind === "platform" && page === "clinics" ? null : (
        <AccountPage
          account={account}
          lang={lang}
          onNavigationGuardChange={registerPatientGuard}
          onExpired={expire}
          onPasswordChanged={() => {
            expire();
            setPasswordChanged(true);
          }}
        />
      )}
    </AppShell>
  );
}
