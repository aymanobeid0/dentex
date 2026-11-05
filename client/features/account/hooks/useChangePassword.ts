import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useApi } from "../../../shared/api/RequestProvider";
import { ApiError } from "../../../shared/api/request";
import { translations, type Lang } from "../../../shared/i18n";
import { useReadAvailability } from "../../../shared/query/useReadAvailability";
import { useDraftGuard, type NavigationGuard } from "../../../ui/useDraftGuard";
import { changePassword } from "../api";
export function useChangePassword({
  lang,
  onExpired,
  onChanged,
  onNavigationGuardChange,
}: {
  lang: Lang;
  onExpired: () => void;
  onChanged: () => void;
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void;
}) {
  const fetch = useApi(),
    t = translations[lang].accountPassword,
    availability = useReadAvailability();
  const [open, setOpen] = useState(false),
    [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [error, setError] = useState<
      "required" | "incorrect" | "error" | "uncertain" | null
    >(null);
  const mutation = useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      changePassword(fetch, input.currentPassword, input.newPassword),
    retry: false,
    networkMode: "always",
    gcTime: 0,
  });
  const busy = mutation.isPending,
    sending = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null),
    currentInput = useRef<HTMLInputElement>(null),
    wasOpen = useRef(false);
  useEffect(() => {
    if (open) currentInput.current?.focus();
    else if (wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  function discard() {
    setOpen(false);
    setCurrent("");
    setNext("");
    setError(null);
  }
  const guard = useDraftGuard(
    !!current || !!next || error === "uncertain",
    busy,
    discard,
    onNavigationGuardChange,
  );
  const saveBlocked = busy || !availability.online || error === "uncertain";
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || saveBlocked) return;
    setError(null);
    if (!current || !next.trim()) {
      setError("required");
      return;
    }
    sending.current = true;
    try {
      await mutation.mutateAsync({
        currentPassword: current,
        newPassword: next,
      });
      discard();
      guard.release();
      onChanged();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof ApiError && error.status === 401) {
        onExpired();
        return;
      }
      if (
        !(error instanceof ApiError) ||
        error.kind === "uncertain" ||
        error.kind === "network" ||
        error.status >= 500 ||
        error.status === 408
      )
        setError("uncertain");
      else
        setError(error.code === "incorrect_password" ? "incorrect" : "error");
    } finally {
      mutation.reset();
      sending.current = false;
    }
  }
  return {
    t,
    open,
    setOpen: (value: boolean) => {
      if (value) setOpen(true);
      else guard.requestLeave(discard);
    },
    current,
    setCurrent,
    next,
    setNext,
    busy,
    error,
    trigger,
    currentInput,
    submit,
    guard,
    saveBlocked,
    online: availability.online,
    cancel: () => guard.requestLeave(discard),
    signInAgain: () =>
      guard.requestLeave(() => {
        discard();
        onExpired();
      }),
  };
}
