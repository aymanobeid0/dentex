import { useCallback, useRef, type ComponentProps } from "react";
import { PatientPage as PatientFeature } from "../../client/features/patients";
import { useLegacyPatientNavigation } from "../../client/app/useLegacyPatientNavigation";
import type { NavigationGuard } from "../../client/ui/useDraftGuard";

// Existing flow cases retain their old URLs through the actual app adapter.
// Controlled feature cases exercise PatientFeature directly.
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
  const navigation = useLegacyPatientNavigation((leave, stay) =>
    guard.current ? guard.current(leave, stay) : leave(),
  );
  return (
    <PatientFeature
      {...props}
      {...navigation}
      onNavigationGuardChange={register}
    />
  );
}
