import { Root as VisuallyHidden } from "@radix-ui/react-visually-hidden";
import type { ReactNode } from "react";

export function ScreenReaderStatus({ children }: { children: ReactNode }) {
  return (
    <VisuallyHidden asChild>
      <p role="status" aria-live="polite" aria-atomic="true">
        {children}
      </p>
    </VisuallyHidden>
  );
}
