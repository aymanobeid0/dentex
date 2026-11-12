import { useCallback, useEffect, useRef, useState } from "react";
import {
  createBrowserRouter,
  Navigate,
  useBlocker,
  useLocation,
  useMatches,
  useNavigate,
} from "react-router";
import "../../design-tokens.css";
import { AccountPage } from "../features/account";
import { LoginPage, Session, useIdentity, useLogout } from "../features/auth";
import { ClinicsPage } from "../features/clinics";
import { EmployeePage } from "../features/employees";
import { PatientPage, type PatientView } from "../features/patients";
import { RolePermissionsPage } from "../features/roles";
import { LanguageSwitch, translations, useLanguage } from "../shared/i18n";
import type { NavigationGuard } from "../ui/useDraftGuard";
import { AppProviders } from "./AppProviders";
import { AppShell } from "./layout/AppShell";
import { paths, routeDefinitions, type Screen } from "./navigation";
import "./styles.css";

export const createAppRouter = () =>
  createBrowserRouter([
    {
      path: "/",
      element: <Application />,
      children: routeDefinitions.map(({ path, screen }) => ({
        path,
        handle: screen,
        element: <></>,
      })),
    },
  ]);

// Transient navigation coordination; identity and server data remain in auth/Query.
type Intent = {
  confirmed: boolean;
  ended: boolean;
  kind: "clinic" | "platform";
  destination: string | null;
};
function Application() {
  const [session, setSession] = useState(
    () => new Session((next) => setSession(next)),
  );
  const [passwordChanged, setPasswordChanged] = useState(false);
  const intent = useRef<Intent>({
    confirmed: false,
    ended: false,
    kind: "clinic",
    destination: null,
  });
  return (
    <AppProviders session={session}>
      <SessionApp
        key={session.id}
        session={session}
        intent={intent.current}
        passwordChanged={passwordChanged}
        setPasswordChanged={setPasswordChanged}
      />
    </AppProviders>
  );
}

function SessionApp({
  session,
  intent,
  passwordChanged,
  setPasswordChanged,
}: {
  session: Session;
  intent: Intent;
  passwordChanged: boolean;
  setPasswordChanged: (value: boolean) => void;
}) {
  const { lang } = useLanguage(),
    t = translations[lang].app;
  const { account, anonymous, boot, stale, failed } = useIdentity(session);
  const location = useLocation(),
    go = useNavigate(),
    matches = useMatches();
  const screen = matches[matches.length - 1].handle as Screen;
  const expire = () => session.replace(null);
  const { busy, error, logout } = useLogout(expire);
  const [clinicBusy, setClinicBusy] = useState(false);
  const pageGuard = useRef<NavigationGuard | null>(null),
    clinicGuard = useRef<NavigationGuard | null>(null);
  const registerPageGuard = useCallback((guard: NavigationGuard | null) => {
    pageGuard.current = guard;
  }, []);
  const registerClinicGuard = useCallback((guard: NavigationGuard | null) => {
    clinicGuard.current = guard;
  }, []);
  const isLogin = screen === "clinicLogin" || screen === "platformLogin";
  const platformRetained =
    account?.kind === "platform" &&
    (screen === "clinics" || screen === "platformAccount");
  const blocker = useBlocker(({ nextLocation }) => {
    if (!account) return false;
    if (
      location.pathname === nextLocation.pathname &&
      location.hash === nextLocation.hash
    )
      return false;
    return !!(busy || clinicBusy || pageGuard.current || clinicGuard.current);
  });
  const attempted = useRef<typeof blocker | null>(null);
  useEffect(() => {
    if (blocker.state !== "blocked") {
      attempted.current = null;
      return;
    }
    // One dialog owns its original attempt, even if the browser asks to leave
    // again before it is answered. Resetting that newer blocker would retire
    // the first dialog's proceed callback as well.
    if (attempted.current) return;
    attempted.current = blocker;
    const proceed = () => {
      attempted.current = null;
      blocker.proceed();
    };
    const reset = () => {
      attempted.current = null;
      blocker.reset();
    };
    if (busy || clinicBusy) {
      reset();
      return;
    }
    const retainsClinic =
      platformRetained &&
      [paths.clinics, paths.platformAccount].some(
        (path) => path === blocker.location.pathname,
      );
    const guard =
      account?.kind === "platform"
        ? retainsClinic
          ? null
          : clinicGuard.current
        : pageGuard.current;
    if (guard) guard(proceed, reset);
    else proceed();
  }, [blocker, busy, clinicBusy, platformRetained, account?.kind]);

  if (account) {
    intent.confirmed = true;
    intent.kind = account.kind;
  } else if (anonymous && intent.confirmed) {
    intent.confirmed = false;
    intent.ended = true;
    intent.destination = null;
  }
  if ((failed || stale) && !account && !anonymous)
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
  if (boot || (!account && !anonymous))
    return (
      <p className="boot" role="status">
        {t.loading}
      </p>
    );

  const legacy = /^#patients(?:\/(new|[^/]+))?$/.exec(location.hash);
  if (legacy)
    return (
      <Navigate
        replace
        to={legacy[1] ? `${paths.patients}/${legacy[1]}` : paths.patients}
      />
    );
  if (!account) {
    if (!isLogin && screen !== "notFound") {
      if (!intent.ended && screen !== "root")
        intent.destination = location.pathname;
      const kind = intent.ended
        ? intent.kind
        : location.pathname.startsWith("/platform")
          ? "platform"
          : "clinic";
      return (
        <Navigate
          replace
          to={paths[kind === "platform" ? "platformLogin" : "clinicLogin"]}
        />
      );
    }
    if (screen === "notFound")
      return (
        <main className="login">
          <LanguageSwitch />
          <h1>{t.notFound}</h1>
          <button
            className="language"
            onClick={() => void go(paths.clinicLogin)}
          >
            {t.toClinic}
          </button>
        </main>
      );
    return (
      <LoginPage
        kind={screen === "platformLogin" ? "platform" : "clinic"}
        onKindChange={(kind) =>
          void go(paths[kind === "platform" ? "platformLogin" : "clinicLogin"])
        }
        passwordChanged={passwordChanged}
        onAuthenticated={(next) => {
          intent.ended = false;
          session.replace(next);
        }}
        onLoggedIn={() => setPasswordChanged(false)}
      />
    );
  }
  const defaultPath = account.kind === "platform" ? paths.clinics : paths.home;
  if (screen === "root" || isLogin)
    return <Navigate replace to={intent.destination ?? defaultPath} />;
  intent.destination = null;
  const admin = account.kind === "clinic" && account.roles.includes("admin");
  const canManageEmployees =
    account.kind === "clinic" &&
    (admin || account.permissions.includes("employees.manage"));
  const canRead =
    account.kind === "clinic" &&
    (admin || account.permissions.includes("patients.read"));
  const canWrite =
    account.kind === "clinic" &&
    (admin || account.permissions.includes("patients.write"));
  const clinicScreen = [
    "home",
    "clinicAccount",
    "patients",
    "patientNew",
    "patientFile",
    "employees",
    "rolePermissions",
  ].includes(screen);
  const platformScreen = [
    "platformRoot",
    "clinics",
    "platformAccount",
  ].includes(screen);
  const forbidden =
    (clinicScreen && account.kind !== "clinic") ||
    (platformScreen && account.kind !== "platform") ||
    (screen === "employees" && !canManageEmployees) ||
    (screen === "rolePermissions" && !admin) ||
    ((screen === "patients" || screen === "patientFile") &&
      !canRead &&
      !(screen === "patients" && canWrite)) ||
    (screen === "patientNew" && !canWrite);
  if (!forbidden && screen === "platformRoot")
    return <Navigate replace to={paths.clinics} />;
  if (!forbidden && screen === "patients" && !canRead && canWrite)
    return <Navigate replace to={paths.patientNew} />;
  const page =
    screen === "clinicAccount" || screen === "platformAccount"
      ? "account"
      : screen === "patientNew" || screen === "patientFile"
        ? "patients"
        : screen === "home" ||
            screen === "clinics" ||
            screen === "employees" ||
            screen === "rolePermissions" ||
            screen === "patients"
          ? screen
          : null;
  const patientView: PatientView =
    screen === "patientNew"
      ? { kind: "new" }
      : screen === "patientFile"
        ? {
            kind: "file",
            patientId: matches[matches.length - 1].params.patientId!,
          }
        : { kind: "list" };
  const navigatePatient = (view: PatientView) =>
    void go(
      view.kind === "file"
        ? `${paths.patients}/${encodeURIComponent(view.patientId)}`
        : view.kind === "new"
          ? paths.patientNew
          : paths.patients,
    );
  const guardedLogout = () => {
    if (busy || clinicBusy) return;
    const leave = () => {
      intent.destination = null;
      intent.ended = true;
      void logout();
    };
    if (account.kind === "platform" && clinicGuard.current)
      clinicGuard.current(leave);
    else if (pageGuard.current) pageGuard.current(leave);
    else leave();
  };
  return (
    <AppShell
      lang={lang}
      page={page}
      kind={account.kind}
      onNavigate={(next) =>
        void go(
          next === "account"
            ? account.kind === "platform"
              ? paths.platformAccount
              : paths.clinicAccount
            : paths[next],
        )
      }
      canManageEmployees={canManageEmployees}
      isAdmin={admin}
      canAccessPatients={canRead || canWrite}
      busy={busy || clinicBusy}
      onLogout={guardedLogout}
    >
      {stale && (
        <p role="status" className="error">
          {t.staleIdentity}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error === "uncertain" ? t.uncertain : t.network}
        </p>
      )}
      {account.kind === "platform" && (
        <ClinicsPage
          lang={lang}
          onExpired={expire}
          active={!forbidden && screen === "clinics"}
          externalBusy={busy}
          onBusyChange={setClinicBusy}
          onNavigationGuardChange={registerClinicGuard}
        />
      )}
      {forbidden || screen === "notFound" ? (
        <section className="card">
          <h1>{forbidden ? t.forbidden : t.notFound}</h1>
          <button className="secondary" onClick={() => void go(defaultPath)}>
            {t.toDefault}
          </button>
        </section>
      ) : screen === "home" && account.kind === "clinic" ? (
        <>
          <div className="content-heading">
            <h1>{t.home}</h1>
          </div>
          <section className="card account-card">
            <div>
              <span>{t.name}</span>
              <p>{account.clinic.name}</p>
            </div>
            <div>
              <span>{t.code}</span>
              <p>
                <bdi>{account.clinic.code}</bdi>
              </p>
            </div>
            <div>
              <span>{t.fullName}</span>
              <p>{account.name}</p>
            </div>
            <div>
              <span>{t.user}</span>
              <p>{account.username}</p>
            </div>
          </section>
        </>
      ) : page === "patients" ? (
        <PatientPage
          lang={lang}
          view={patientView}
          onNavigate={navigatePatient}
          canRead={canRead}
          canWrite={canWrite}
          canLookupOldNumber={admin}
          onExpired={expire}
          onNavigationGuardChange={registerPageGuard}
        />
      ) : page === "employees" ? (
        <EmployeePage
          lang={lang}
          canManageAdmins={admin}
          onExpired={expire}
          onIdentityChanged={() => session.refresh()}
          onNavigationGuardChange={registerPageGuard}
        />
      ) : page === "rolePermissions" ? (
        <RolePermissionsPage
          lang={lang}
          onExpired={expire}
          onNavigationGuardChange={registerPageGuard}
        />
      ) : page === "account" ? (
        <AccountPage
          account={account}
          lang={lang}
          onExpired={expire}
          onNavigationGuardChange={registerPageGuard}
          onPasswordChanged={() => {
            expire();
            setPasswordChanged(true);
          }}
        />
      ) : null}
    </AppShell>
  );
}
