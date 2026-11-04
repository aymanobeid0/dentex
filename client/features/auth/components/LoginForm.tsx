import { ArrowRight, Building2, LockKeyhole, UserRound } from "lucide-react";
import { Label } from "../../../ui/Label";
import { PasswordVisibility } from "../../../ui/PasswordVisibility";
import type { useLogin } from "../hooks/useLogin";
type Props = Pick<ReturnType<typeof useLogin>, "passwordChanged" | "t" | "busy" | "show" | "setShow" | "error" | "username" | "setUsername" | "password" | "setPassword" | "loginCode" | "setLoginCode" | "loginKind" | "login">;
export function LoginForm({
  passwordChanged,
  t,
  busy,
  show,
  setShow,
  error,
  username,
  setUsername,
  password,
  setPassword,
  loginCode,
  setLoginCode,
  loginKind,
  login,
}: Props) {
  return (
    <form onSubmit={login}>
      {passwordChanged && (
        <p className="success" role="status">
          {t.passwordChanged}
        </p>
      )}
      {loginKind === "clinic" && (
        <Label className="field">
          <span>{t.code}</span>
          <span className="input-shell">
            <Building2 size={16} aria-hidden="true" />
            <input
              dir="ltr"
              className="clinic-code"
              value={loginCode}
              onChange={(e) => setLoginCode(e.target.value)}
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              autoComplete="off"
              required
            />
          </span>
        </Label>
      )}
      <Label className="field">
        <span>{t.user}</span>
        <span className="input-shell">
          <UserRound size={16} aria-hidden="true" />
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </span>
      </Label>
      <Label className="field">
        <span>{t.password}</span>
        <span className="input-shell">
          <LockKeyhole size={16} aria-hidden="true" />
          <input
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <PasswordVisibility
            shown={show}
            onShownChange={setShow}
            showLabel={t.show}
            hideLabel={t.hide}
          />
        </span>
      </Label>
      <button className="primary" disabled={busy}>
        {t.login}
        <ArrowRight size={16} className="directional" aria-hidden="true" />
      </button>
      <p className="error" role="alert">
        {error
          ? t[
              error as
                | "network"
                | "invalid"
                | "limit"
                | "origin"
                | "server"
                | "uncertain"
            ]
          : ""}
      </p>
    </form>
  );
}
