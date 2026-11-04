import { useCallback, useEffect, useRef, useState } from "react";

export type NavigationGuard = (leave: () => void) => void;

export function useRegistrationDraftGuard(
  dirty: boolean,
  busy: boolean,
  discardDraft: () => void,
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void,
) {
  const current = useRef({ dirty, busy, discardDraft });
  current.current = { dirty, busy, discardDraft };
  const [pending, setPending] = useState<(() => void) | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const requestLeave = useCallback<NavigationGuard>((leave) => {
    if (current.current.busy) return;
    if (!current.current.dirty) {
      leave();
      return;
    }
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setPending(() => leave);
  }, []);
  useEffect(() => {
    onNavigationGuardChange?.(requestLeave);
    return () => onNavigationGuardChange?.(null);
  }, [onNavigationGuardChange, requestLeave]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty, busy]);
  return {
    requestLeave,
    pending,
    returnFocus,
    release: () => {
      current.current.dirty = false;
      current.current.busy = false;
      setPending(null);
    },
    stay: () => setPending(null),
    discard: () => {
      current.current.discardDraft();
      current.current.dirty = false;
      setPending(null);
      pending?.();
    },
  };
}
