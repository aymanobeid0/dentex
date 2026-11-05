import { useMutation } from "@tanstack/react-query";
import { useReadAvailability } from "../../../shared/query/useReadAvailability";
import { useRef, useState, type FormEvent } from "react";
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
  const availability = useReadAvailability();
  const mutation = useMutation({
    mutationFn: (input: {
      kind: "clinic" | "platform";
      credentials: { code?: string; username: string; password: string };
    }) => loginAccount(fetch, input.kind, input.credentials),
    retry: false,
    networkMode: "always",
    gcTime: 0,
  });
  const sending = useRef(false),
    busy = mutation.isPending;
  const [show, setShow] = useState(false),
    [error, setError] = useState("");
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [loginCode, setLoginCode] = useState(""),
    [loginKind, setLoginKind] = useState<"clinic" | "platform">("clinic");
  async function login(e: FormEvent) {
    e.preventDefault();
    if (sending.current || busy || !availability.online) return;
    sending.current = true;
    setError("");
    try {
      const account = await mutation.mutateAsync({
        kind: loginKind,
        credentials:
          loginKind === "clinic"
            ? { code: loginCode, username, password }
            : { username, password },
      });
      onAuthenticated(account);
      setPassword("");
      onLoggedIn();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setError(
        error instanceof ApiError &&
          (error.kind === "uncertain" ||
            error.kind === "network" ||
            error.status >= 500 ||
            error.status === 408)
          ? "uncertain"
          : error instanceof ApiError && error.status > 0
            ? loginFailure(error.status)
            : "network",
      );
    } finally {
      mutation.reset();
      sending.current = false;
    }
  }
  return {
    passwordChanged,
    t,
    busy: busy || !availability.online,
    show,
    setShow,
    error: !availability.online ? "network" : error,
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
