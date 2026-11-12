import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  title: string;
  description: string;
  close: string;
  direction: "rtl" | "ltr";
  children: ReactNode;
  size?: "default" | "wide";
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="draft-dialog-overlay" />
        <Dialog.Content
          className="draft-dialog"
          data-size={size}
          dir={direction}
        >
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          {children}
          <div className="draft-dialog-actions">
            <Dialog.Close asChild>
              <button className="ui-button">{close}</button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
