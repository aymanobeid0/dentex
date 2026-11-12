import * as AlertDialog from "@radix-ui/react-alert-dialog";
import type { ReactNode, RefObject } from "react";

export function ConfirmDialog({
  open,
  direction,
  title,
  description,
  cancel,
  confirm,
  onCancel,
  onConfirm,
  busy,
  blocked,
  returnFocus,
  children,
}: {
  open: boolean;
  direction: "rtl" | "ltr";
  title: string;
  description: string;
  cancel: string;
  confirm: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
  blocked: boolean;
  returnFocus: RefObject<HTMLElement | null>;
  children?: ReactNode;
}) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="draft-dialog-overlay" />
        <AlertDialog.Content
          className="draft-dialog"
          dir={direction}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
        >
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.Description>{description}</AlertDialog.Description>
          {children}
          <div className="draft-dialog-actions">
            <AlertDialog.Cancel asChild>
              <button className="ui-button" disabled={busy} onClick={onCancel}>
                {cancel}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                className="primary action"
                disabled={busy || blocked}
                onClick={(event) => {
                  event.preventDefault();
                  onConfirm();
                }}
              >
                {confirm}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
