// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPatient } from "./render-patient";
import { PatientPage } from "./controlled-patient";
import { application } from "./app";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

it.each(['ar', 'fr'] as const)('keeps the registration draft on exhausted numbering in %s without retry', async lang => {
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => options?.method === 'POST'
    ? { ok: false, status: 409, json: async () => ({ error: 'numbering_exhausted' }) }
    : { ok: true, json: async () => ({ items: [], page: 1, hasNext: false }) });
  vi.stubGlobal('fetch', fetcher);
  window.history.replaceState(null, '', '#patients/new');
  renderPatient(<PatientPage lang={lang} canRead canWrite onExpired={() => {}} />);
  const name = screen.getByRole('textbox', { name: lang === 'ar' ? 'الاسم الكامل' : 'Nom complet' });
  fireEvent.change(name, { target: { value: 'Draft capacity' } });
  fireEvent.change(screen.getByRole('textbox', { name: lang === 'ar' ? 'الهاتف' : 'Téléphone' }), { target: { value: '46108834' } });
  const user = userEvent.setup();
  screen.getByRole('combobox').focus();
  await user.keyboard('{Enter}{End}{Enter}');
  fireEvent.submit(name.closest('form')!);
  expect((await screen.findByRole('alert')).textContent).toContain(lang === 'ar' ? 'سعة أرقام' : 'capacité');
  expect((name as HTMLInputElement).value).toBe('Draft capacity');
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});

it("guards sidebar navigation and logout without losing a draft after identity refresh", async () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  localStorage.setItem("dentex-lang", "fr");
  window.history.replaceState(null, "", "#patients/new");
  const fetcher = vi.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      url === "/api/auth/me"
        ? {
            kind: "clinic",
            username: "reader",
            name: "Reader",
            roles: ["admin"],
            permissions: [],
            clinic: { id: "clinic-one", name: "Clinic", code: "2000" },
          }
        : { items: [], page: 1, hasNext: false },
  }));
  vi.stubGlobal("fetch", fetcher);
  render(application());
  const name = await screen.findByRole("textbox", { name: "Nom complet" });
  fireEvent.change(name, { target: { value: "Draft" } });
  fireEvent(window, new Event("online"));
  fireEvent(window, new Event("focus"));
  fireEvent.click(screen.getByRole("button", { name: "Mon compte" }));
  await screen.findByRole("alertdialog");
  fireEvent.click(screen.getByRole("button", { name: "Rester" }));
  expect((name as HTMLInputElement).value).toBe("Draft");
  fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
  await screen.findByRole("alertdialog");
  expect(fetcher.mock.calls.some(([url]) => url.includes("logout"))).toBe(
    false,
  );
  fireEvent.click(screen.getByRole("button", { name: "Rester" }));
  fireEvent.click(screen.getByRole("button", { name: "Mon compte" }));
  await screen.findByRole("alertdialog");
  fireEvent.click(screen.getByRole("button", { name: "Ignorer et quitter" }));
  await screen.findByRole("heading", { name: "Mon compte" });
  expect(screen.queryByRole("textbox", { name: "Nom complet" })).toBeNull();
});

it("waits for confirmation, opens the saved file and refreshes the list without a dirty warning", async () => {
  let finish!: (value: unknown) => void;
  let saved = false;
  const patient = {
    id: "confirmed",
    name: "Marie",
    phone: "+22246108834",
    gender: "female",
    isChild: false,
    fileNumber: "1099",
    birthDate: null,
    address: null,
    administrativeNote: null,
  };
  const response = (body: unknown) => ({ ok: true, json: async () => body });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST")
        return new Promise((resolve) => {
          finish = resolve;
        });
      if (url.includes("/confirmed")) return response(patient);
      return response({
        items: saved ? [patient] : [],
        page: 1,
        hasNext: false,
      });
    }),
  );
  window.history.replaceState(null, "", "#patients");
  renderPatient(
    <PatientPage lang="fr" canRead canWrite onExpired={() => {}} />,
  );
  await screen.findByText("Aucun patient enregistré pour le moment.");
  fireEvent.click(screen.getByRole("button", { name: "Nouveau patient" }));
  await fill();
  fireEvent.click(
    screen.getByRole("button", { name: "Enregistrer le patient" }),
  );
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  expect(screen.queryByRole("heading", { name: "Marie" })).toBeNull();
  expect(screen.getByRole("textbox", { name: /Nom complet|الاسم الكامل/ })).toBeTruthy();
  saved = true;
  await act(async () =>
    finish(response({ id: "confirmed", fileNumber: "1099" })),
  );
  await screen.findByRole("heading", { name: "Marie" });
  expect(screen.queryByRole("alertdialog")).toBeNull();
  const unload = new Event("beforeunload", { cancelable: true });
  fireEvent(window, unload);
  expect(unload.defaultPrevented).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Retour à la liste" }));
  await screen.findByRole("button", { name: "Marie" });
});
it.each(["ar", "fr"] as const)(
  "protects a draft on internal navigation and unload, then discards it (%s)",
  async (lang) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ items: [], page: 1, hasNext: false }),
      })),
    );
    window.history.replaceState(null, "", "#patients/new");
    renderPatient(
      <PatientPage lang={lang} canRead canWrite onExpired={() => {}} />,
    );
    const name = screen.getByRole("textbox", {
      name: lang === "fr" ? "Nom complet" : "الاسم الكامل",
    });
    fireEvent.change(name, { target: { value: "Draft" } });
    const unloading = new Event("beforeunload", { cancelable: true });
    fireEvent(window, unloading);
    expect(unloading.defaultPrevented).toBe(true);
    fireEvent.click(
      screen.getByRole("button", {
        name: lang === "fr" ? "Retour à la liste" : "العودة إلى القائمة",
      }),
    );
    await screen.findByRole("alertdialog");
    const stay = screen.getByRole("button", {
      name: lang === "fr" ? "Rester" : "البقاء",
    });
    await waitFor(() => expect(document.activeElement).toBe(stay));
    await userEvent.keyboard("{Escape}");
    expect((name as HTMLInputElement).value).toBe("Draft");
    expect(screen.getByRole("textbox", { name: /Nom complet|الاسم الكامل/ })).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: lang === "fr" ? "Retour à la liste" : "العودة إلى القائمة",
      }),
    );
    await screen.findByRole("alertdialog");
    fireEvent.click(
      screen.getByRole("button", {
        name: lang === "fr" ? "Ignorer et quitter" : "تجاهل ومغادرة",
      }),
    );
    await screen.findByRole("button", {
      name: lang === "fr" ? "Nouveau patient" : "مريض جديد",
    });
    const cleanUnload = new Event("beforeunload", { cancelable: true });
    fireEvent(window, cleanUnload);
    expect(cleanUnload.defaultPrevented).toBe(false);
  },
);
async function fill() {
  fireEvent.change(screen.getByRole("textbox", { name: "Nom complet" }), {
    target: { value: "Marie" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Téléphone" }), {
    target: { value: "46108834" },
  });
  screen.getByRole("combobox").focus();
  await userEvent.keyboard("{Enter}{End}{Enter}");
}
it.each([false, true])(
  "hides completed or late review data when reading is revoked (pending=%s)",
  async (pending) => {
    let finish!: (value: unknown) => void;
    const result = {
      ok: true,
      json: async () => ({
        items: [
          {
            id: "saved-child",
            name: "Saved child",
            fileNumber: "2020",
            phone: "+22246108834",
            isChild: true,
          },
        ],
        page: 1,
        hasNext: false,
      }),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method === "POST") throw new TypeError("lost");
        if (pending)
          return new Promise((resolve) => {
            finish = resolve;
          });
        return result;
      }),
    );
    window.history.replaceState(null, "", "#patients/new");
    const view = renderPatient(
      <PatientPage lang="fr" canRead canWrite onExpired={() => {}} />,
    );
    await fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Enregistrer le patient" }),
    );
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "Actualiser la liste des patients" }),
    );
    if (pending) await waitFor(() => expect(finish).toBeTypeOf("function"));
    else await screen.findByRole("button", { name: /Saved child/ });
    view.rerender(
      <PatientPage lang="fr" canRead={false} canWrite onExpired={() => {}} />,
    );
    if (pending) await act(async () => finish(result));
    expect(screen.queryByRole("button", { name: /Saved child/ })).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Enregistrer le patient",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("textbox", { name: "Nom complet" }) as HTMLInputElement)
        .value,
    ).toBe("Marie");
    view.rerender(
      <PatientPage lang="fr" canRead canWrite onExpired={() => {}} />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Enregistrer le patient",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  },
);
it("keeps an uncertain draft through reconnection and requires server review before a manual retry", async () => {
  const posts: string[] = [];
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      posts.push(String(options.body));
      throw new TypeError("response lost");
    }
    return {
      ok: true,
      json: async () => ({ items: [], page: 1, hasNext: false }),
    };
  });
  vi.stubGlobal("fetch", fetcher);
  window.history.replaceState(null, "", "#patients/new");
  renderPatient(
    <PatientPage lang="fr" canRead canWrite onExpired={() => {}} />,
  );
  await fill();
  const save = screen.getByRole("button", { name: "Enregistrer le patient" });
  fireEvent.click(save);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "confirmation de l’inscription impossible",
  );
  expect((save as HTMLButtonElement).disabled).toBe(true);
  fireEvent(window, new Event("offline"));
  fireEvent(window, new Event("online"));
  expect(posts).toHaveLength(1);
  expect(
    (screen.getByRole("textbox", { name: "Nom complet" }) as HTMLInputElement)
      .value,
  ).toBe("Marie");
  fireEvent.click(
    screen.getByRole("button", { name: "Actualiser la liste des patients" }),
  );
  await screen.findByText(/Aucun dossier trouvé/);
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  expect(
    fetcher.mock.calls.some(([url]) => String(url).includes("q=46108834")),
  ).toBe(true);
  expect(fetcher.mock.calls.some(([url]) => String(url).includes('status=all'))).toBe(true);
  expect(posts).toHaveLength(1);
  fireEvent.click(save);
  await waitFor(() => expect(posts).toHaveLength(2));
});
it.each(["lost-body", "invalid-receipt", "server-error"])(
  "does not claim success from %s and keeps manual retry blocked after a failed review",
  async (failure) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method === "POST")
          return {
            ok: failure !== "server-error",
            status: failure === "server-error" ? 500 : 201,
            json: async () => {
              if (failure === "lost-body") throw new TypeError("body lost");
              return {};
            },
          };
        throw new TypeError("still offline");
      }),
    );
    window.history.replaceState(null, "", "#patients/new");
    renderPatient(
      <PatientPage lang="fr" canRead canWrite onExpired={() => {}} />,
    );
    await fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Enregistrer le patient" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "confirmation de l’inscription impossible",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Actualiser la liste des patients" }),
    );
    await screen.findByText(/Connexion au serveur ou actualisation des patients impossible/);
    expect(
      (
        screen.getByRole("button", {
          name: "Enregistrer le patient",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("textbox", { name: "Nom complet" }) as HTMLInputElement)
        .value,
    ).toBe("Marie");
    expect(screen.getByRole("textbox", { name: /Nom complet|الاسم الكامل/ })).toBeTruthy();
  },
);
