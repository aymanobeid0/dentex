// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useDraftGuard } from "../../client/ui/useDraftGuard";
import { DiscardDraftDialog } from "../../client/ui/DiscardDraftDialog";

afterEach(cleanup);
function Example({ busy = false }: { busy?: boolean }) {
  const [draft, setDraft] = useState("Draft");
  const [result, setResult] = useState("idle");
  const guard = useDraftGuard(!!draft, busy, () => setDraft(""));
  return (
    <>
      <p>{draft || "empty"}</p>
      <p role="status">{result}</p>
      <button
        onClick={() =>
          guard.requestLeave(
            () => setResult("left"),
            () => setResult("stayed"),
          )
        }
      >
        Navigate
      </button>
      <DiscardDraftDialog
        open={!!guard.pending}
        direction="ltr"
        title="Leave?"
        description="Unsaved draft"
        stay="Stay"
        discard="Discard"
        onStay={guard.stay}
        onDiscard={guard.discard}
        returnFocus={guard.returnFocus}
      />
    </>
  );
}
it("cancels a requested departure on Escape and permits a fresh discard once", async () => {
  render(<Example />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Navigate" }));
  await user.keyboard("{Escape}");
  expect(screen.getByRole("status").textContent).toBe("stayed");
  expect(screen.getByText("Draft")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Navigate" }));
  await user.click(screen.getByRole("button", { name: "Discard" }));
  expect(screen.getByRole("status").textContent).toBe("left");
  expect(screen.getByText("empty")).toBeTruthy();
});
it("cancels a busy departure immediately without replay after saving", () => {
  const { rerender } = render(<Example busy />);
  fireEvent.click(screen.getByRole("button", { name: "Navigate" }));
  expect(screen.getByRole("status").textContent).toBe("stayed");
  rerender(<Example />);
  expect(screen.getByRole("status").textContent).toBe("stayed");
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
