import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

export function SelectField({ id, value, onValueChange, placeholder, options, direction, required, disabled, invalid, describedBy, labelledBy }: {
  id: string; value: string; onValueChange: (value: string) => void; placeholder: string;
  options: { value: string; label: string }[]; direction: 'rtl' | 'ltr'; required?: boolean;
  disabled?: boolean; invalid?: boolean; describedBy?: string; labelledBy?: string;
}) {
  return <Select.Root value={value} onValueChange={onValueChange} dir={direction} required={required} disabled={disabled}>
    <Select.Trigger id={id} className="ui-select" aria-invalid={invalid} aria-describedby={describedBy} aria-labelledby={labelledBy}>
      <Select.Value placeholder={placeholder}/><Select.Icon><ChevronDown size={16} aria-hidden/></Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Content position="popper" sideOffset={4} className="ui-select-content" dir={direction}>
      <Select.ScrollUpButton className="ui-select-scroll"><ChevronUp size={16} aria-hidden/></Select.ScrollUpButton>
      <Select.Viewport>{options.map(option => <Select.Item key={option.value} value={option.value} className="ui-select-item">
        <Select.ItemText>{option.label}</Select.ItemText><Select.ItemIndicator><Check size={15} aria-hidden/></Select.ItemIndicator>
      </Select.Item>)}</Select.Viewport>
      <Select.ScrollDownButton className="ui-select-scroll"><ChevronDown size={16} aria-hidden/></Select.ScrollDownButton>
    </Select.Content></Select.Portal>
  </Select.Root>;
}
