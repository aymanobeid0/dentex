import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApi } from "../../../shared/api/RequestProvider";
import { translations, type Lang } from "../../../shared/i18n";
import { changePassword } from "../api";
export function useChangePassword({
  lang,
  onExpired,
  onChanged,
}: {
  lang: Lang;
  onExpired: () => void;
  onChanged: () => void;
}) {
  const fetch = useApi();
  const t = translations[lang].accountPassword;
  const [open, setOpen] = useState(false),
    [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<keyof typeof t | null>(null);
  const trigger = useRef<HTMLButtonElement>(null),
    currentInput = useRef<HTMLInputElement>(null),
    wasOpen = useRef(false);
  useEffect(() => {
    if (open) currentInput.current?.focus();
    else if (wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!current || !next.trim()) {
      setError("required");
      return;
    }
    setBusy(true);
    try {
      const r = await changePassword(fetch, current, next);
      if (r.status === 401) {
        onExpired();
        return;
      }
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data.error === "incorrect_password" ? "incorrect" : "error");
        return;
      }
      setCurrent("");
      setNext("");
      onChanged();
    } catch {
      setError("error");
    } finally {
      setBusy(false);
    }
  }
  return {
    t,
    open,
    setOpen,
    current,
    setCurrent,
    next,
    setNext,
    busy,
    error,
    setError,
    trigger,
    currentInput,
    submit,
  };
}
