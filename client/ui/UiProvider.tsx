import { DirectionProvider } from '@radix-ui/react-direction';
import { Provider as TooltipProvider } from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

export function UiProvider({ direction, children }: { direction: 'rtl' | 'ltr'; children: ReactNode }) {
  return <DirectionProvider dir={direction}><TooltipProvider delayDuration={300}>{children}</TooltipProvider></DirectionProvider>;
}
