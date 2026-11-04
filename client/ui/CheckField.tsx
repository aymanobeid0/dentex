import * as Checkbox from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Label } from './Label';

export function CheckField({ id, checked, onCheckedChange, disabled, children, className = '' }: {
  id?: string; checked: boolean; onCheckedChange: (checked: boolean) => void;
  disabled?: boolean; children: ReactNode; className?: string;
}) {
  const generated = useId(), controlId = id ?? generated;
  return <div className={`choice-field ${className}`}>
    <Checkbox.Root id={controlId} checked={checked} onCheckedChange={value => onCheckedChange(value === true)} disabled={disabled} className="ui-checkbox">
      <Checkbox.Indicator className="ui-checkbox-indicator"><Check size={13} strokeWidth={2.5} aria-hidden/></Checkbox.Indicator>
    </Checkbox.Root>
    <Label htmlFor={controlId}>{children}</Label>
  </div>;
}
