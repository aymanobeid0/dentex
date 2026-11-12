import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Hint } from "./Hint";
type Props = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "title" | "className"
> & {
  label: string;
  tone?: "neutral" | "primary" | "warning" | "danger" | "success";
  children: ReactNode;
};
export function IconButton({
  label,
  tone = "neutral",
  children,
  type = "button",
  ...props
}: Props) {
  return (
    <Hint text={label}>
      <button
        {...props}
        type={type}
        className={`icon-btn${tone === "neutral" ? "" : tone === "success" ? " soft-success" : ` hover-${tone}`}`}
        aria-label={label}
      >
        {children}
      </button>
    </Hint>
  );
}
