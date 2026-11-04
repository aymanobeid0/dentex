import "./ui-browser-apis";
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "../../client/app/App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it("retains a clinic creation draft and loaded list across account navigation", async () => {
  localStorage.setItem("dentex-lang", "fr");
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  const fetch = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      url === "/api/auth/me"
        ? { kind: "platform", username: "platform" }
        : [{ id: "one", name: "Existing clinic", code: "2000" }],
  }));
  vi.stubGlobal("fetch", fetch);
  render(<App />);
  await screen.findByText("Existing clinic");
  fireEvent.click(screen.getByRole("button", { name: "Créer un cabinet" }));
  fireEvent.change(screen.getByLabelText("Nom du cabinet"), {
    target: { value: "Unfinished draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Mon compte" }));
  expect(await screen.findByText("platform", { selector: "p" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cabinets" }));
  expect(
    (screen.getByLabelText("Nom du cabinet") as HTMLInputElement).value,
  ).toBe("Unfinished draft");
  expect(
    fetch.mock.calls.filter(([url]) => url === "/api/clinics"),
  ).toHaveLength(1);
});
