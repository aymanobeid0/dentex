import { Root as Toggle } from "@radix-ui/react-toggle";
import { Eye, EyeOff } from "lucide-react";
import { Hint } from "./Hint";

export function PasswordVisibility({
  shown,
  onShownChange,
  showLabel,
  hideLabel,
}: {
  shown: boolean;
  onShownChange: (shown: boolean) => void;
  showLabel: string;
  hideLabel: string;
}) {
  const label = shown ? hideLabel : showLabel;
  return (
    <Hint text={label}>
      <Toggle
        type="button"
        className="icon"
        pressed={shown}
        onPressedChange={onShownChange}
        aria-label={label}
      >
        {shown ? (
          <EyeOff size={16} aria-hidden />
        ) : (
          <Eye size={16} aria-hidden />
        )}
      </Toggle>
    </Hint>
  );
}
