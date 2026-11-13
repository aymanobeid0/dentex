import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./IconButton";

export function Modal({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  close,
  direction,
  children,
  size = "default",
  headerIcon,
  footer,
  onOpenAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  title: string;
  description: string;
  close: string;
  direction: "rtl" | "ltr";
  children: ReactNode;
  size?: "default" | "wide" | "compact";
  headerIcon?: ReactNode;
  footer?: ReactNode;
  onOpenAutoFocus?: (event: Event) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="draft-dialog-overlay" />
        <Dialog.Content
          className="draft-dialog"
          data-size={size}
          data-framed={!!headerIcon}
          dir={direction}
          onOpenAutoFocus={onOpenAutoFocus}
          onEscapeKeyDown={(event) => {
            // Let an expanded editable combobox consume Escape before the dialog.
            if (
              event.target instanceof HTMLElement &&
              event.target.closest('[role="combobox"][aria-expanded="true"]')
            )
              event.preventDefault();
          }}
        >
          {headerIcon ? (
            <header className="ui-dialog-header">
              <span className="ui-dialog-title-icon">{headerIcon}</span>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Close asChild>
                <IconButton label={close}>
                  <X size={16} aria-hidden />
                </IconButton>
              </Dialog.Close>
            </header>
          ) : (
            <Dialog.Title>{title}</Dialog.Title>
          )}
          <Dialog.Description className={headerIcon ? "ui-sr-only" : undefined}>
            {description}
          </Dialog.Description>
          {children}
          {footer ||
            (!headerIcon && (
              <div className="draft-dialog-actions">
                <Dialog.Close asChild>
                  <button className="ui-button">{close}</button>
                </Dialog.Close>
              </div>
            ))}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
