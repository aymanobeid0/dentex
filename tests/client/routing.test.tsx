import "./ui-browser-apis";
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { application } from "./app";
import userEvent from "@testing-library/user-event";

const clinic = {
  kind: "clinic",
  username: "routing-user",
  name: "Routing user",
  clinic: { id: "routing", name: "Routing clinic", code: "9876" },
  roles: ["admin"],
  permissions: [],
};
const response = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  localStorage.setItem("dentex-lang", "fr");
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

it("opens the requested account URL after initial identity verification", async () => {
  window.history.replaceState(null, "", "/clinic/account");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      response(url === "/api/auth/me" ? clinic : { items: [], hasMore: false }),
    ),
  );
  render(application());
  await screen.findByRole("heading", { name: "Mon compte" });
  expect(window.location.pathname).toBe("/clinic/account");
  fireEvent.click(screen.getByRole("button", { name: "Patients" }));
  await waitFor(() =>
    expect(window.location.pathname).toBe("/clinic/patients"),
  );
});

it("returns an initial anonymous protected opening to its requested page after login", async () => {
  window.history.replaceState(null, "", "/clinic/account");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      response(
        url.endsWith("/login") ? clinic : { error: "unauthorized" },
        url.endsWith("/login") ? 200 : 401,
      ),
    ),
  );
  render(application());
  await screen.findByLabelText("Code du cabinet");
  expect(window.location.pathname).toBe("/clinic/login");
  fireEvent.change(screen.getByLabelText("Code du cabinet"), {
    target: { value: "9876" },
  });
  fireEvent.change(screen.getByLabelText("Nom d’utilisateur"), {
    target: { value: "routing-user" },
  });
  fireEvent.change(
    screen.getByLabelText("Mot de passe", { selector: "input" }),
    { target: { value: "synthetic-only" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
  await screen.findByRole("heading", { name: "Mon compte" });
  expect(window.location.pathname).toBe("/clinic/account");
});

it("starts a writer-only patient opening at registration without reading the list", async () => {
  window.history.replaceState(null, "", "/clinic/patients");
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requests.push(url);
      return response({
        ...clinic,
        roles: ["dentist"],
        permissions: ["patients.write"],
      });
    }),
  );
  render(application());
  await screen.findByRole("textbox", { name: "Nom complet" });
  expect(window.location.pathname).toBe("/clinic/patients/new");
  expect(requests.every((path) => path === "/api/auth/me")).toBe(true);
});

it("distinguishes forbidden known pages from unknown URLs without reading protected data", async () => {
  window.history.replaceState(null, "", "/clinic/employees");
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requests.push(url);
      return response({ ...clinic, roles: ["dentist"], permissions: [] });
    }),
  );
  render(application());
  await screen.findByRole("heading", { name: "Accès non autorisé" });
  expect(window.location.pathname).toBe("/clinic/employees");
  expect(requests.every((path) => path === "/api/auth/me")).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "Ouvrir la page d’accueil" }),
  );
  await screen.findByRole("heading", { name: "Accueil" });
});

it("shows an unknown initial URL without redirecting it to another screen", async () => {
  window.history.replaceState(null, "", "/unknown-page");
  vi.stubGlobal("fetch", vi.fn(async () => response(clinic)));
  render(application());
  await screen.findByRole("heading", { name: "Page introuvable" });
  expect(window.location.pathname).toBe("/unknown-page");
});

it("keeps the current login fields while its URL changes kind and clears the password", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response({ error: "unauthorized" }, 401)),
  );
  render(application());
  await screen.findByLabelText("Code du cabinet");
  fireEvent.change(screen.getByLabelText("Code du cabinet"), {
    target: { value: "9876" },
  });
  fireEvent.change(screen.getByLabelText("Nom d’utilisateur"), {
    target: { value: "retained-user" },
  });
  fireEvent.change(
    screen.getByLabelText("Mot de passe", { selector: "input" }),
    { target: { value: "never-in-url" } },
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Connexion administrateur du programme",
    }),
  );
  await screen.findByRole("heading", { name: "Connexion administrateur" });
  expect(window.location.pathname).toBe("/platform/login");
  expect(
    (screen.getByLabelText("Nom d’utilisateur") as HTMLInputElement).value,
  ).toBe("retained-user");
  expect(
    (
      screen.getByLabelText("Mot de passe", {
        selector: "input",
      }) as HTMLInputElement
    ).value,
  ).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Connexion au cabinet" }));
  await screen.findByLabelText("Code du cabinet");
  expect(
    (screen.getByLabelText("Code du cabinet") as HTMLInputElement).value,
  ).toBe("9876");
});

it.each(["/clinic/login", "/platform/login"])(
  "opens the current account default from %s without changing identity",
  async (path) => {
    window.history.replaceState(null, "", path);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(clinic)),
    );
    render(application());
    await screen.findByRole("heading", { name: "Accueil" });
    expect(window.location.pathname).toBe("/clinic");
    expect(
      screen.queryByLabelText("Mot de passe", { selector: "input" }),
    ).toBeNull();
  },
);

it("cancels Back with a draft, then proceeds once and keeps Forward usable", async () => {
  window.history.replaceState(null, "", "/clinic/account");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      response(
        url === "/api/auth/me"
          ? clinic
          : { items: [], page: 1, hasNext: false },
      ),
    ),
  );
  render(application());
  fireEvent.click(await screen.findByRole("button", { name: "Patients" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Nouveau patient" }),
  );
  const name = await screen.findByRole("textbox", { name: "Nom complet" });
  fireEvent.change(name, { target: { value: "History draft" } });
  act(() => window.history.back());
  await screen.findByRole("alertdialog");
  await userEvent.keyboard("{Escape}");
  await waitFor(() =>
    expect(window.location.pathname).toBe("/clinic/patients/new"),
  );
  expect((name as HTMLInputElement).value).toBe("History draft");
  act(() => window.history.back());
  await screen.findByRole("alertdialog");
  fireEvent.click(screen.getByRole("button", { name: "Rester" }));
  await waitFor(() =>
    expect(window.location.pathname).toBe("/clinic/patients/new"),
  );
  expect((name as HTMLInputElement).value).toBe("History draft");
  act(() => window.history.back());
  fireEvent.click(
    await screen.findByRole("button", { name: "Ignorer et quitter" }),
  );
  await screen.findByRole("button", { name: "Nouveau patient" });
  expect(window.location.pathname).toBe("/clinic/patients");
  act(() => window.history.forward());
  const blank = await screen.findByRole("textbox", { name: "Nom complet" });
  expect((blank as HTMLInputElement).value).toBe("");
  expect(window.location.pathname).toBe("/clinic/patients/new");
});

it("uses the default after a known expiration and removes the old secret draft", async () => {
  window.history.replaceState(null, "", "/clinic/account");
  let expired = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/login")) {
        expired = false;
        return response(clinic);
      }
      return response(
        expired ? { error: "unauthorized" } : clinic,
        expired ? 401 : 200,
      );
    }),
  );
  render(application());
  fireEvent.click(
    await screen.findByRole("button", { name: "Changer le mot de passe" }),
  );
  fireEvent.change(screen.getByLabelText("Mot de passe actuel"), {
    target: { value: "old-secret" },
  });
  expired = true;
  Object.defineProperty(navigator, "onLine", {
    value: false,
    configurable: true,
  });
  fireEvent(window, new Event("offline"));
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  fireEvent(window, new Event("online"));
  await screen.findByLabelText("Code du cabinet");
  expect(screen.queryByDisplayValue("old-secret")).toBeNull();
  fireEvent.change(screen.getByLabelText("Code du cabinet"), {
    target: { value: "9876" },
  });
  fireEvent.change(screen.getByLabelText("Nom d’utilisateur"), {
    target: { value: "routing-user" },
  });
  fireEvent.change(
    screen.getByLabelText("Mot de passe", { selector: "input" }),
    { target: { value: "synthetic-only" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
  await screen.findByRole("heading", { name: "Accueil" });
  expect(window.location.pathname).toBe("/clinic");
});

it("cancels busy sidebar navigation without replay after a rejected write", async () => {
  window.history.replaceState(null, "", "/clinic/patients/new");
  let finish!: (value: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) =>
      options?.method === "POST"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : response(clinic),
    ),
  );
  render(application());
  const name = await screen.findByRole("textbox", { name: "Nom complet" });
  fireEvent.change(name, { target: { value: "Busy draft" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Téléphone" }), {
    target: { value: "46108834" },
  });
  screen.getByRole("combobox").focus();
  await userEvent.keyboard("{Enter}{End}{Enter}");
  fireEvent.click(
    screen.getByRole("button", { name: "Enregistrer le patient" }),
  );
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("button", { name: "Mon compte" }));
  await act(async () => {});
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(window.location.pathname).toBe("/clinic/patients/new");
  await act(async () => finish(response({ error: "invalid_input" }, 400)));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Enregistrer le patient",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  expect(window.location.pathname).toBe("/clinic/patients/new");
  expect((name as HTMLInputElement).value).toBe("Busy draft");
  fireEvent.click(screen.getByRole("button", { name: "Mon compte" }));
  await screen.findByRole("alertdialog");
});

it("opens the confirmed patient file after cancelling a busy departure without a ghost discard dialog", async () => {
  window.history.replaceState(null, "", "/clinic/patients/new");
  let finish!: (value: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST")
        return new Promise((resolve) => {
          finish = resolve;
        });
      return response(
        url === "/api/auth/me"
          ? clinic
          : {
              id: "confirmed",
              name: "Confirmed patient",
              phone: "+22246108834",
              fileNumber: "7",
              gender: "female",
              isChild: false,
            },
      );
    }),
  );
  render(application());
  fireEvent.change(
    await screen.findByRole("textbox", { name: "Nom complet" }),
    { target: { value: "Confirmed patient" } },
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Téléphone" }), {
    target: { value: "46108834" },
  });
  screen.getByRole("combobox").focus();
  await userEvent.keyboard("{Enter}{End}{Enter}");
  fireEvent.click(
    screen.getByRole("button", { name: "Enregistrer le patient" }),
  );
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("button", { name: "Mon compte" }));
  await act(async () => {});
  expect(screen.queryByRole("alertdialog")).toBeNull();
  await act(async () =>
    finish(response({ id: "confirmed", fileNumber: "7" }, 201)),
  );
  await screen.findByRole("heading", { name: "Confirmed patient" });
  expect(window.location.pathname).toBe("/clinic/patients/confirmed");
  expect(screen.queryByRole("alertdialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Nouveau patient" }));
  fireEvent.change(
    await screen.findByRole("textbox", { name: "Nom complet" }),
    { target: { value: "New protected draft" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Mon compte" }));
  await screen.findByRole("alertdialog");
});

it("keeps one departure decision when another history request arrives while its dialog is open", async () => {
  window.history.replaceState(null, "", "/clinic/account");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      response(
        url === "/api/auth/me"
          ? clinic
          : { items: [], page: 1, hasNext: false },
      ),
    ),
  );
  render(application());
  fireEvent.click(await screen.findByRole("button", { name: "Patients" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Nouveau patient" }),
  );
  fireEvent.change(
    await screen.findByRole("textbox", { name: "Nom complet" }),
    { target: { value: "One pending decision" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Mon compte" }));
  await screen.findByRole("alertdialog");
  await act(async () => {
    const moved = new Promise((resolve) =>
      window.addEventListener("popstate", resolve, { once: true }),
    );
    window.history.back();
    await moved;
  });
  expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Ignorer et quitter" }));
  await screen.findByRole("heading", { name: "Mon compte" });
  expect(window.location.pathname).toBe("/clinic/account");
});
