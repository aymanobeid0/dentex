import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type NavigationGuard = (leave: () => void, stay?: () => void) => void;

export function useDraftGuard(
  dirty: boolean,
  busy: boolean,
  discardDraft: () => void,
  onNavigationGuardChange?: (guard: NavigationGuard | null) => void,
) {
  const current = useRef({ dirty, busy, discardDraft });
  const released = useRef(false);
  // Publish only committed draft state: an abandoned router render must not
  // rearm a draft that a confirmed write or discard has just released.
  useLayoutEffect(() => {
    if (released.current) {
      // release/discard is immediate, while the caller's clean draft update may
      // commit later. Do not rearm from an intervening pre-clean snapshot.
      current.current = { dirty: false, busy: false, discardDraft };
      if (!dirty && !busy) released.current = false;
      return;
    }
    current.current = { dirty, busy, discardDraft };
  });
  const [pending, setPending] = useState<(() => void) | null>(null);
  const attempt = useRef<{ leave: () => void; stay?: () => void } | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const requestLeave = useCallback<NavigationGuard>((leave, stay) => {
    if (current.current.busy || attempt.current) {
      stay?.();
      return;
    }
    if (!current.current.dirty) {
      leave();
      return;
    }
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    attempt.current = { leave, stay };
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
      released.current = true;
      current.current.dirty = false;
      current.current.busy = false;
      setPending(null);
      const previous = attempt.current;
      attempt.current = null;
      previous?.stay?.();
    },
    stay: () => {
      const previous = attempt.current;
      attempt.current = null;
      setPending(null);
      previous?.stay?.();
    },
    discard: () => {
      const previous = attempt.current;
      if (!previous) return;
      attempt.current = null;
      released.current = true;
      current.current.discardDraft();
      current.current.dirty = false;
      setPending(null);
      previous.leave();
    },
  };
}
