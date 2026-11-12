import { useCallback, useEffect, useRef, useState } from "react";
import type { PatientView } from "../features/patients";
import type { NavigationGuard } from "../ui/useDraftGuard";

function readView(hash: string): PatientView {
  if (hash === "#patients/new") return { kind: "new" };
  const match = /^#patients\/([^/]+)$/.exec(hash);
  if (match) {
    try {
      return { kind: "file", patientId: decodeURIComponent(match[1]) };
    } catch {
      return { kind: "list" };
    }
  }
  return { kind: "list" };
}

// Temporary app-owned adapter for the existing hash URLs, replaced by ticket 02.
export function useLegacyPatientNavigation(
  navigate: NavigationGuard,
  onOpen?: () => void,
) {
  const [view, setView] = useState(() => readView(window.location.hash));
  const hash = useRef(window.location.hash);
  const current = useRef({ navigate, onOpen });
  current.current = { navigate, onOpen };
  const onNavigate = useCallback((next: PatientView) => {
    current.current.navigate(() => {
      const target =
        next.kind === "file"
          ? `#patients/${encodeURIComponent(next.patientId)}`
          : next.kind === "new"
            ? "#patients/new"
            : "#patients";
      hash.current = target;
      window.location.hash = target;
      setView(next);
      current.current.onOpen?.();
    });
  }, []);
  useEffect(() => {
    const changed = () => {
      const target = window.location.hash;
      if (target === hash.current) return;
      window.history.replaceState(
        null,
        "",
        hash.current || window.location.pathname,
      );
      current.current.navigate(() => {
        window.history.replaceState(
          null,
          "",
          target || window.location.pathname,
        );
        hash.current = target;
        setView(readView(target));
        if (target.startsWith("#patients")) current.current.onOpen?.();
      });
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  return { view, onNavigate };
}
