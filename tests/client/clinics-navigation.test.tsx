import "./ui-browser-apis";
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { application } from "./app";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it("guards a retained creation secret when logging out from the account screen", async () => {
  localStorage.setItem("dentex-lang", "fr");
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  let logouts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/auth/logout") {
        logouts++;
        return new Response(null, { status: 204 });
      }
      return new Response(
        JSON.stringify(
          url === "/api/auth/me"
            ? { kind: "platform", username: "platform" }
            : [],
        ),
      );
    }),
  );
  render(application());
  fireEvent.click(
    await screen.findByRole("button", { name: "Créer un cabinet" }),
  );
  fireEvent.change(screen.getByLabelText("Mot de passe du responsable"), {
    target: { value: "private-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Mon compte" }));
  fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
  await screen.findByRole("alertdialog");
  expect(logouts).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "Rester" }));
  fireEvent.click(screen.getByRole("button", { name: "Cabinets" }));
  expect(
    (screen.getByLabelText("Mot de passe du responsable") as HTMLInputElement)
      .value,
  ).toBe("private-password");
  fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Ignorer et quitter" }),
  );
  await screen.findByRole("heading", { name: "Connexion administrateur" });
  expect(logouts).toBe(1);
  expect(Object.keys(localStorage)).toEqual(["dentex-lang"]);
});

it("does not show a late clinic list from a retired platform session", async () => {
  localStorage.setItem("dentex-lang", "fr");
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  let finish!: (r: Response) => void, signal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url === "/api/auth/me")
        return new Response(
          JSON.stringify({ kind: "platform", username: "first" }),
        );
      if (url === "/api/auth/logout")
        return new Response(null, { status: 204 });
      signal = options?.signal as AbortSignal;
      return new Promise<Response>((resolve) => (finish = resolve));
    }),
  );
  render(application());
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
  await screen.findByRole("heading", { name: "Connexion administrateur" });
  expect(signal?.aborted).toBe(true);
  await act(async () =>
    finish(
      new Response(
        JSON.stringify([
          { id: "old", name: "PRIVATE OLD CLINIC", code: "2000" },
        ]),
      ),
    ),
  );
  expect(screen.queryByText("PRIVATE OLD CLINIC")).toBeNull();
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
  render(application());
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
  ).toHaveLength(2);
});
