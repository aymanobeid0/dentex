import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactElement } from 'react';

export function Hint({ text, children, enabled = true }: { text: string; children: ReactElement; enabled?: boolean }) {
  if (!enabled) return children;
  return <Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger><Tooltip.Portal>
    <Tooltip.Content className="ui-tooltip" sideOffset={6}>{text}<Tooltip.Arrow className="ui-tooltip-arrow"/></Tooltip.Content>
  </Tooltip.Portal></Tooltip.Root>;
}
