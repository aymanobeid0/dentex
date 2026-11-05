// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderPatient } from "./render-patient";
import { ClinicsPage } from "../../client/features/clinics/pages/ClinicsPage";
import { translations } from "../../client/shared/i18n";
afterEach(() => {
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  fireEvent(window, new Event("online"));
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
  vi.unstubAllGlobals();
});
const clinic = { id: "c", name: "Existing clinic", code: "2000" };
it.each(['ar', 'fr'] as const)('submits the exact numbering start and preserves it on rejection in %s', async lang => {
  const posts: Record<string, string>[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      posts.push(JSON.parse(String(options.body)));
      return new Response(JSON.stringify({ error: 'duplicate_code' }), { status: 409 });
    }
    return new Response(JSON.stringify([clinic]));
  }));
  renderPatient(<ClinicsPage lang={lang} onExpired={() => {}} />);
  const t = translations[lang].app;
  await screen.findByText(clinic.name);
  fireEvent.click(screen.getByRole('button', { name: t.create }));
  const start = screen.getByLabelText(lang === 'ar' ? 'بداية أرقام ملفات المرضى' : 'Premier numéro de dossier patient');
  expect((start as HTMLInputElement).value).toBe('1');
  for (const [label, value] of [[t.name,'New'],[t.code,'2345'],[t.managerName,'Manager'],[t.managerUsername,'qa'],[t.managerPassword,'test-password']]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  for (const invalid of ['0', '-1', '1.5', 'abc', '9223372036854775808']) {
    fireEvent.change(start, { target: { value: invalid } });
    fireEvent.click(screen.getByRole('button', { name: t.save }));
    expect(posts).toHaveLength(0);
    expect(start.getAttribute('aria-invalid')).toBe('true');
  }
  fireEvent.change(start, { target: { value: '9007199254740993' } });
  fireEvent.click(screen.getByRole('button', { name: t.save }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0].patientFileNumberStart).toBe('9007199254740993');
  expect((start as HTMLInputElement).value).toBe('9007199254740993');
});
it("keeps a clinic creation secret after a lost reply and requires explicit server review", async () => {
  let writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        writes++;
        throw Error("lost reply");
      }
      return new Response(JSON.stringify([clinic]));
    }),
  );
  renderPatient(<ClinicsPage lang="fr" onExpired={() => {}} />);
  const t = translations.fr.app;
  await screen.findByText(clinic.name);
  fireEvent.click(screen.getByRole("button", { name: t.create }));
  for (const [label, value] of [
    [t.name, "New clinic"],
    [t.code, "2345"],
    [t.managerName, "Manager"],
    [t.managerUsername, "newmanager"],
    [t.managerPassword, "private-test-password"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: t.save }));
  await screen.findByText(translations.fr.writes.uncertain);
  expect(
    (screen.getByLabelText(t.managerPassword) as HTMLInputElement).value,
  ).toBe("private-test-password");
  expect(
    (screen.getByRole("button", { name: t.save }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: translations.fr.writes.review }),
  );
  await screen.findByText(/Existing clinic/);
  fireEvent.click(
    screen.getByRole("button", { name: translations.fr.writes.acknowledge }),
  );
  expect(writes).toBe(1);
  expect(
    (screen.getByRole("button", { name: t.save }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});

it.each(["ar", "fr"] as const)(
  "preserves a %s administrator reset secret and requires manual recovery after a lost reply",
  async (lang) => {
    const t = translations[lang],
      a = t.clinicAdmins;
    let writes = 0,
      lost = true;
    const admin = {
      id: "a",
      name: "Manager",
      username: "manager",
      active: true,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        if (options?.method === "POST") {
          writes++;
          if (lost) throw Error("lost");
          return new Response(null, { status: 204 });
        }
        return new Response(
          JSON.stringify(url.endsWith("/admins") ? [admin] : [clinic]),
        );
      }),
    );
    renderPatient(<ClinicsPage lang={lang} onExpired={() => {}} />);
    fireEvent.click(
      await screen.findByRole("button", { name: t.app.manageAdmins }),
    );
    fireEvent.click(await screen.findByRole("button", { name: a.reset }));
    fireEvent.change(screen.getByLabelText(a.password), {
      target: { value: "private-admin-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: a.back }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: t.editing.stay }));
    expect((screen.getByLabelText(a.password) as HTMLInputElement).value).toBe(
      "private-admin-password",
    );
    fireEvent.click(screen.getByRole("button", { name: a.save }));
    await screen.findByText(t.writes.uncertain);
    expect(
      (screen.getByRole("button", { name: a.save }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
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
    expect(writes).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: t.writes.review }));
    await screen.findByRole("button", { name: t.writes.acknowledge });
    expect(screen.getByText(t.writes.passwordHint)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.writes.acknowledge }));
    lost = false;
    fireEvent.click(screen.getByRole("button", { name: a.save }));
    await screen.findByText(a.saved);
    expect(writes).toBe(2);
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  },
);

it.each([201, 409, 500, 202])(
  "keeps create outcome distinct and waits for confirmation (%s)",
  async (status) => {
    const t = translations.fr.app;
    let finish!: (r: Response) => void,
      stored = false,
      writes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method === "POST") {
          writes++;
          return new Promise<Response>((resolve) => (finish = resolve));
        }
        return new Response(
          JSON.stringify(
            stored
              ? [clinic, { id: "new", name: "Created clinic", code: "2345" }]
              : [clinic],
          ),
        );
      }),
    );
    renderPatient(<ClinicsPage lang="fr" onExpired={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: t.create }));
    for (const [label, value] of [
      [t.name, "Created clinic"],
      [t.code, "2345"],
      [t.managerName, "Manager"],
      [t.managerUsername, "newmanager"],
      [t.managerPassword, "private-test-password"],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(screen.queryByText(t.created)).toBeNull();
    fireEvent.submit(
      screen.getByRole("button", { name: t.save }).closest("form")!,
    );
    expect(writes).toBe(1);
    stored = status === 201;
    finish(
      new Response(
        JSON.stringify(
          status === 201 || status === 202
            ? {
                id: "new",
                name: "Created clinic",
                code: status === 202 ? 2345 : "2345",
              }
            : { error: status === 409 ? "duplicate_code" : "server_error" },
        ),
        { status },
      ),
    );
    if (status === 201) {
      await screen.findByText(t.created);
      await screen.findByRole("cell", { name: "Created clinic" });
    } else {
      await screen.findByText(
        status === 409 ? t.duplicate : translations.fr.writes.uncertain,
      );
      expect(
        (screen.getByLabelText(t.managerPassword) as HTMLInputElement).value,
      ).toBe("private-test-password");
    }
  },
);

it("polls only the displayed clinic resource, stops when hidden/inactive/offline and preserves a draft", async () => {
  vi.useFakeTimers();
  let lists = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      lists++;
      return new Response(JSON.stringify([clinic]));
    }),
  );
  const view = renderPatient(<ClinicsPage lang="fr" onExpired={() => {}} />);
  const advance = async (ms = 0) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };
  await advance();
  expect(lists).toBe(1);
  fireEvent.click(
    screen.getByRole("button", { name: translations.fr.app.create }),
  );
  fireEvent.change(screen.getByLabelText(translations.fr.app.name), {
    target: { value: "Draft" },
  });
  await advance(15050);
  expect(lists).toBe(2);
  expect(
    (screen.getByLabelText(translations.fr.app.name) as HTMLInputElement).value,
  ).toBe("Draft");
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  fireEvent(document, new Event("visibilitychange"));
  await advance(30050);
  expect(lists).toBe(2);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  fireEvent(document, new Event("visibilitychange"));
  await advance();
  expect(lists).toBe(3);
  view.rerender(<ClinicsPage lang="fr" active={false} onExpired={() => {}} />);
  await advance(30050);
  expect(lists).toBe(3);
  view.rerender(<ClinicsPage lang="fr" onExpired={() => {}} />);
  await advance();
  expect(lists).toBe(4);
  Object.defineProperty(navigator, "onLine", {
    value: false,
    configurable: true,
  });
  fireEvent(window, new Event("offline"));
  await advance(30050);
  expect(lists).toBe(4);
  expect(
    (
      screen.getByRole("button", {
        name: translations.fr.app.save,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});

it("polls only visible administrators, preserves a password draft and hides a rejected cached list", async () => {
  vi.useFakeTimers();
  let lists = 0,
    admins = 0,
    denied = false,
    fail = false;
  const t = translations.fr,
    a = t.clinicAdmins;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (!url.endsWith("/admins")) {
        lists++;
        return new Response(JSON.stringify([clinic]));
      }
      admins++;
      return new Response(
        JSON.stringify(
          denied
            ? { error: "forbidden" }
            : fail
              ? { error: "server_error" }
              : [
                  {
                    id: "a",
                    name: "Manager",
                    username: "manager",
                    active: true,
                  },
                ],
        ),
        { status: denied ? 403 : fail ? 500 : 200 },
      );
    }),
  );
  const advance = async (ms = 0) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };
  const view = renderPatient(<ClinicsPage lang="fr" onExpired={() => {}} />);
  await advance();
  fireEvent.click(screen.getByRole("button", { name: t.app.manageAdmins }));
  await advance();
  expect([lists, admins]).toEqual([1, 1]);
  fireEvent.click(screen.getByRole("button", { name: a.reset }));
  fireEvent.change(screen.getByLabelText(a.password), {
    target: { value: "private-test-password" },
  });
  await advance(15050);
  expect([lists, admins]).toEqual([1, 2]);
  expect((screen.getByLabelText(a.password) as HTMLInputElement).value).toBe(
    "private-test-password",
  );
  view.rerender(<ClinicsPage lang="fr" active={false} onExpired={() => {}} />);
  await advance(30050);
  expect(admins).toBe(2);
  view.rerender(<ClinicsPage lang="fr" onExpired={() => {}} />);
  await advance();
  expect(admins).toBe(3);
  fireEvent.click(screen.getByRole("button", { name: a.cancel }));
  fireEvent.click(screen.getByRole("button", { name: t.editing.discard }));
  fail = true;
  await advance(15050);
  expect(screen.getByRole("cell", { name: "Manager" })).toBeTruthy();
  expect(screen.getByText(t.editing.stale)).toBeTruthy();
  fail = false;
  denied = true;
  await advance(15050);
  expect(screen.queryByRole("cell", { name: "Manager" })).toBeNull();
  expect(screen.getByText(a.error)).toBeTruthy();
  const rejectedReads = admins;
  await advance(6000);
  expect(admins).toBe(rejectedReads);
});

it.each([false, true])(
  "requires a fresh creation review after a denied read, including a late review (%s)",
  async (late) => {
    const t = translations.fr;
    let denied = false,
      delay = false,
      finish!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method === "POST") throw Error("lost");
        if (delay) {
          delay = false;
          return new Promise<Response>((resolve) => (finish = resolve));
        }
        return new Response(
          JSON.stringify(denied ? { error: "forbidden" } : [clinic]),
          { status: denied ? 403 : 200 },
        );
      }),
    );
    renderPatient(<ClinicsPage lang="fr" onExpired={() => {}} />);
    await screen.findByText(clinic.name);
    fireEvent.click(screen.getByRole("button", { name: t.app.create }));
    for (const [label, value] of [
      [t.app.name, "New clinic"],
      [t.app.code, "2345"],
      [t.app.managerName, "Manager"],
      [t.app.managerUsername, "newmanager"],
      [t.app.managerPassword, "private-test-password"],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: t.app.save }));
    await screen.findByText(t.writes.uncertain);
    delay = late;
    fireEvent.click(screen.getByRole("button", { name: t.writes.review }));
    if (late) await waitFor(() => expect(finish).toBeTypeOf("function"));
    else await screen.findByRole("button", { name: t.writes.acknowledge });
    const reconnect = () => {
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
    };
    denied = true;
    reconnect();
    await screen.findByText(t.app.network);
    if (late) finish(new Response(JSON.stringify([clinic])));
    denied = false;
    reconnect();
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: t.writes.review,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(
      screen.queryByRole("button", { name: t.writes.acknowledge }),
    ).toBeNull();
    expect(
      (screen.getByRole("button", { name: t.app.save }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText(t.app.managerPassword) as HTMLInputElement).value,
    ).toBe("private-test-password");
  },
);
