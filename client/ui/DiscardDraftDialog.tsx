import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { ArrowLeft, Undo2 } from "lucide-react";
import type { RefObject } from "react";

export function DiscardDraftDialog({
  open,
  direction,
  title,
  description,
  stay,
  discard,
  onStay,
  onDiscard,
  returnFocus,
}: {
  open: boolean;
  direction: "rtl" | "ltr";
  title: string;
  description: string;
  stay: string;
  discard: string;
  onStay: () => void;
  onDiscard: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onStay();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="draft-dialog-overlay" />
        <AlertDialog.Content
          className="draft-dialog"
          dir={direction}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
        >
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.Description>{description}</AlertDialog.Description>
          <div className="draft-dialog-actions">
            <AlertDialog.Cancel asChild>
              <button className="language" onClick={onStay}>
                <Undo2 size={16} aria-hidden />
                {stay}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button className="primary action" onClick={onDiscard}>
                <ArrowLeft size={16} className="directional" aria-hidden />
                {discard}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
