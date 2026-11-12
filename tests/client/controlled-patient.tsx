import { useCallback, useRef, useState, type ComponentProps } from "react";
import {
  PatientPage as PatientFeature,
  type PatientView,
} from "../../client/features/patients";
import type { NavigationGuard } from "../../client/ui/useDraftGuard";

// Feature-flow tests control the public view input; full routing is tested through App.
export function PatientPage(
  props: Omit<ComponentProps<typeof PatientFeature>, "view" | "onNavigate">,
) {
  const guard = useRef<NavigationGuard | null>(null);
  const register = useCallback(
    (next: NavigationGuard | null) => {
      guard.current = next;
      props.onNavigationGuardChange?.(next);
    },
    [props.onNavigationGuardChange],
  );
  const [view, setView] = useState<PatientView>(() => {
    const segment = window.location.hash.replace(/^#patients\/?/, "");
    return segment === "new"
      ? { kind: "new" }
      : segment
        ? { kind: "file", patientId: decodeURIComponent(segment) }
        : { kind: "list" };
  });
  const onNavigate = (next: PatientView) => {
    const leave = () => setView(next);
    if (guard.current) guard.current(leave);
    else leave();
  };
  return (
    <PatientFeature
      {...props}
      view={view}
      onNavigate={onNavigate}
      onNavigationGuardChange={register}
    />
  );
}
