import { Building2 } from "lucide-react";
import { LanguageSwitch } from "../../../shared/i18n";
import { useLogin } from "../hooks/useLogin";
import type { Account } from "../types";
import { LoginForm } from "./LoginForm";
export function LoginPage({
  passwordChanged,
  onAuthenticated,
  onLoggedIn,
}: {
  passwordChanged: boolean;
  onAuthenticated: (account: Account) => void;
  onLoggedIn: () => void;
}) {
  const {
    t,
    busy,
    show,
    setShow,
    error,
    setError,
    username,
    setUsername,
    password,
    setPassword,
    loginCode,
    setLoginCode,
    loginKind,
    setLoginKind,
    login,
  } = useLogin({ passwordChanged, onAuthenticated, onLoggedIn });
  const language = <LanguageSwitch />;
  return (
    <div className="login-page">
      <main className="login">
        <header className="top">
          <div className="brand">
            <strong aria-hidden="true">D</strong>Dentex
          </div>
          {language}
        </header>
        <div className="login-body">
          <h1>{loginKind === "clinic" ? t.clinicTitle : t.title}</h1>
          <p className="lead">
            {loginKind === "clinic" ? t.clinicLead : t.lead}
          </p>
          <LoginForm
            passwordChanged={passwordChanged}
            t={t}
            busy={busy}
            show={show}
            setShow={setShow}
            error={error}
            username={username}
            setUsername={setUsername}
            password={password}
            setPassword={setPassword}
            loginCode={loginCode}
            setLoginCode={setLoginCode}
            loginKind={loginKind}
            login={login}
          />
          <button
            type="button"
            className="login-switch"
            onClick={() => {
              setLoginKind(loginKind === "clinic" ? "platform" : "clinic");
              setPassword("");
              setError("");
            }}
          >
            {loginKind === "clinic" ? t.toPlatform : t.toClinic}
          </button>
        </div>
        <footer>Dentex · {t.dashboard}</footer>
      </main>
      <aside className="visual">
        <div>
          <h2>{loginKind === "clinic" ? t.clinicIntro : t.intro}</h2>
          <p>{loginKind === "clinic" ? t.clinicDescription : t.description}</p>
          <div className="visual-card">
            <Building2 size={20} aria-hidden="true" />
            <strong>{t.dashboard}</strong>
            <p>
              {loginKind === "clinic" ? t.clinicDescription : t.description}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
