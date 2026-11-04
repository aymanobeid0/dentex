import { useState, type FormEvent } from "react";
import { ApiError } from "../../../shared/api/request";
import { useApi } from "../../../shared/api/RequestProvider";
import { translations, useLanguage } from "../../../shared/i18n";
import { loginAccount } from "../api";
import { loginFailure } from "../login-errors";
import type { Account } from "../types";
export function useLogin({
  passwordChanged,
  onAuthenticated,
  onLoggedIn,
}: {
  passwordChanged: boolean;
  onAuthenticated: (account: Account) => void;
  onLoggedIn: () => void;
}) {
  const { lang } = useLanguage();
  const t = translations[lang].app;
  const fetch = useApi();
  const [busy, setBusy] = useState(false),
    [show, setShow] = useState(false),
    [error, setError] = useState("");
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [loginCode, setLoginCode] = useState(""),
    [loginKind, setLoginKind] = useState<"clinic" | "platform">("clinic");
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await loginAccount(
        fetch,
        loginKind,
        loginKind === "clinic"
          ? { code: loginCode, username, password }
          : { username, password },
      );
      if (!r.ok) {
        setError(loginFailure(r.status));
        return;
      }
      onAuthenticated(await r.json());
      setPassword("");
      onLoggedIn();
    } catch (error) {
      setError(
        error instanceof ApiError && error.kind === "uncertain"
          ? "uncertain"
          : "network",
      );
    } finally {
      setBusy(false);
    }
  }
  return {
    passwordChanged,
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
  };
}
