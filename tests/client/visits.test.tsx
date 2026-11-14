// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, it, expect, vi } from "vitest";
import {
  act,
  cleanup,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPatient } from "./render-patient";
import { VisitsPage } from "../../client/features/visits";
import { translations } from "../../client/shared/i18n";
const patient = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Synthetic patient",
  fileNumber: "12",
  archived: false,
};
const doctor = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Synthetic doctor",
  eligible: true,
};
const row = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  patient,
  doctor,
  status: "waiting",
  arrivedAt: "2026-11-13T09:00:00.000Z",
  recordedEndAt: null,
  editVersion: 1,
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function transport(
  write: (body: any) => Promise<Response> = async () =>
    new Response(JSON.stringify(row), { status: 201 }),
) {
  let rows: (typeof row)[] = [];
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      const result = await write(JSON.parse(String(options.body)));
      if (result.status === 201) rows = [row];
      return result;
    }
    if (url.includes("/patients?"))
      return new Response(
        JSON.stringify({ items: [patient], page: 1, hasNext: false }),
      );
    if (url.endsWith("/doctors"))
      return new Response(JSON.stringify({ items: [doctor] }));
    return new Response(JSON.stringify({ items: rows, doctors: [doctor] }));
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
async function fill(lang: "ar" | "fr") {
  const user = userEvent.setup(),
    t = translations[lang].visits;
  await user.click(screen.getByRole("button", { name: t.arrive }));
  fireEvent.change(screen.getByRole("combobox", { name: t.patientSearch }), {
    target: { value: "Synthetic" },
  });
  await user.click(
    await screen.findByRole("option", { name: /Synthetic patient/ }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: t.doctor }).hasAttribute("disabled"),
    ).toBe(false),
  );
  screen.getByRole("combobox", { name: t.doctor }).focus();
  await user.keyboard("{Enter}{Home}{Enter}");
  return user;
}
it.each(["ar", "fr"] as const)(
  "registers arrival from empty patient search and refreshes the waiting queue in %s",
  async (lang) => {
    const fetcher = transport(),
      t = translations[lang].visits;
    renderPatient(<VisitsPage lang={lang} onExpired={() => {}} />);
    await screen.findByText(t.empty);
    expect(fetcher.mock.calls.some(([url]) => url.includes("/patients?"))).toBe(
      false,
    );
    const user = await fill(lang);
    expect(screen.getByRole("dialog").getAttribute("dir")).toBe(
      lang === "ar" ? "rtl" : "ltr",
    );
    await user.click(screen.getByRole("button", { name: t.save }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText(patient.name)).toBeTruthy();
    expect(
      fetcher.mock.calls.filter(([, o]) => o?.method === "POST"),
    ).toHaveLength(1);
  },
);
it("searches immediately on Enter and does not select a stale result after the search text changes", async () => {
  const fetcher = transport(),
    t = translations.fr.visits;
  renderPatient(<VisitsPage lang="fr" onExpired={() => {}} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: t.arrive }));
  const input = screen.getByRole("combobox", { name: t.patientSearch });
  fireEvent.change(input, { target: { value: "Synthetic" } });
  input.focus();
  await user.keyboard("{Enter}");
  await screen.findByRole("option", { name: /Synthetic patient/ });
  await user.keyboard("{ArrowDown}");
  fireEvent.change(input, { target: { value: "Different" } });
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([url]) => url.includes("q=Different")),
    ).toBe(true),
  );
  expect(screen.queryByRole("status")?.textContent || "").not.toContain(
    "Synthetic patient",
  );
});
it.each(["ar", "fr"] as const)(
  "keeps arrival draft and blocks retransmission after a lost reply until explicit review in %s",
  async (lang) => {
    const fetcher = transport(async () => {
        throw new TypeError("synthetic disconnected reply");
      }),
      t = translations[lang].visits,
      w = translations[lang].writes;
    renderPatient(<VisitsPage lang={lang} onExpired={() => {}} />);
    const user = await fill(lang);
    await user.click(screen.getByRole("button", { name: t.save }));
    await screen.findByText(w.uncertain);
    expect(screen.getByText(patient.name)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: t.save }).hasAttribute("disabled"),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: w.review }));
    await screen.findByText(t.reviewEmpty);
    expect(
      screen.getByRole("button", { name: t.save }).hasAttribute("disabled"),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: w.acknowledge }));
    expect(
      screen.getByRole("button", { name: t.save }).hasAttribute("disabled"),
    ).toBe(false);
    expect(
      fetcher.mock.calls.filter(([, o]) => o?.method === "POST"),
    ).toHaveLength(1);
  },
);
it("does not accept a malformed successful response as a confirmed arrival", async () => {
  transport(
    async () => new Response(JSON.stringify({ id: row.id }), { status: 201 }),
  );
  renderPatient(<VisitsPage lang="fr" onExpired={() => {}} />);
  const user = await fill("fr");
  await user.click(
    screen.getByRole("button", { name: translations.fr.visits.save }),
  );
  await screen.findByText(translations.fr.writes.uncertain);
  expect(screen.getByRole("dialog")).toBeTruthy();
});
it("retains the cached queue when a manual refresh fails and hides it after access is denied", async () => {
  let status = 200;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            status === 200
              ? { items: [row], doctors: [doctor] }
              : { error: status === 403 ? "forbidden" : "server_error" },
          ),
          { status },
        ),
    ),
  );
  renderPatient(<VisitsPage lang="fr" onExpired={() => {}} />);
  const user = userEvent.setup(),
    t = translations.fr.visits;
  await screen.findByText(patient.name);
  status = 503;
  await user.click(screen.getByRole("button", { name: t.refresh }));
  await screen.findByText(t.failed);
  expect(screen.getByText(patient.name)).toBeTruthy();
  status = 403;
  await user.click(screen.getByRole("button", { name: t.refresh }));
  await screen.findByText(t.readDenied);
  expect(screen.queryByText(patient.name)).toBeNull();
});
it.each(["ar", "fr"] as const)(
  "preserves transfer draft on conflict and requires explicit review of current version in %s",
  async (lang) => {
    const other = {
      ...doctor,
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      name: "Other doctor",
    };
    let patches = 0;
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        patches++;
        return new Response(JSON.stringify({ error: "edit_conflict" }), {
          status: 409,
        });
      }
      if (url.endsWith("/doctors"))
        return new Response(JSON.stringify({ items: [doctor, other] }));
      if (url.endsWith(`/${row.id}`))
        return new Response(JSON.stringify({ ...row, editVersion: 2 }));
      return new Response(
        JSON.stringify({ items: [row], doctors: [doctor, other] }),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const t = translations[lang].visits,
      e = translations[lang].editing,
      user = userEvent.setup();
    renderPatient(<VisitsPage lang={lang} onExpired={() => {}} />);
    await screen.findByText(patient.name);
    await user.click(screen.getByRole("button", { name: t.transfer }));
    await waitFor(() =>
      expect(
        screen
          .getByRole("combobox", { name: t.doctor })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    screen.getByRole("combobox", { name: t.doctor }).focus();
    await user.keyboard("{Enter}{End}{Enter}");
    await user.click(screen.getByRole("button", { name: t.saveTransfer }));
    await screen.findByText(e.conflict);
    expect(
      screen.getByRole("combobox", { name: t.doctor }).textContent,
    ).toContain(other.name);
    expect(
      screen
        .getByRole("button", { name: t.saveTransfer })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: e.review }));
    await screen.findByText(e.reviewHint);
    await user.click(screen.getByRole("button", { name: e.keepDraft }));
    expect(
      screen.getByRole("combobox", { name: t.doctor }).textContent,
    ).toContain(other.name);
    expect(
      screen
        .getByRole("button", { name: t.saveTransfer })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(patches).toBe(1);
  },
);
it("confirms pre-entry departure once while a response is pending and returns focus to a remaining control", async () => {
  let resolve!: (response: Response) => void,
    patches = 0,
    rows = [row];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        patches++;
        return new Promise<Response>((done) => (resolve = done));
      }
      if (url.endsWith("/doctors"))
        return new Response(JSON.stringify({ items: [doctor] }));
      return new Response(JSON.stringify({ items: rows, doctors: [doctor] }));
    }),
  );
  const t = translations.fr.visits,
    user = userEvent.setup();
  renderPatient(<VisitsPage lang="fr" onExpired={() => {}} />);
  await screen.findByText(patient.name);
  await user.click(screen.getByRole("button", { name: t.leave }));
  const dialog = screen.getByRole("alertdialog");
  await user.dblClick(within(dialog).getByRole("button", { name: t.leave }));
  expect(patches).toBe(1);
  rows = [];
  await act(async () =>
    resolve(
      new Response(
        JSON.stringify({
          ...row,
          status: "left_before_entry",
          recordedEndAt: "2026-11-13T10:00:00.000Z",
          editVersion: 2,
        }),
      ),
    ),
  );
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  await screen.findByText(t.empty);
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: t.arrive }),
    ),
  );
});
it("keeps a modified arrival draft on Escape until the discard dialog is explicitly accepted", async () => {
  transport();
  const t = translations.fr.visits,
    e = translations.fr.editing,
    user = await (async () => {
      renderPatient(<VisitsPage lang="fr" onExpired={() => {}} />);
      return fill("fr");
    })();
  await user.keyboard("{Escape}");
  await screen.findByRole("alertdialog", { name: e.discardTitle });
  await user.click(screen.getByRole("button", { name: e.stay }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByText(patient.name)).toBeTruthy();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: e.discard }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("button", { name: t.arrive })).toBeTruthy();
});
it.each(["ar", "fr"] as const)(
  "starts and completes the selected waiting patient in %s",
  async (lang) => {
    const t = translations[lang].visits;
    let current: any = row;
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        if (url.endsWith("/start"))
          current = {
            ...row,
            status: "with_doctor",
            editVersion: 2,
            visit: {
              id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              status: "in_progress",
              startedAt: "2026-11-13T10:00:00.000Z",
              recordedEndAt: null,
              editVersion: 1,
            },
          };
        else
          current = {
            ...current,
            status: "completed",
            recordedEndAt: "2026-11-13T11:00:00.000Z",
            editVersion: 3,
            visit: {
              ...current.visit,
              status: "completed",
              recordedEndAt: "2026-11-13T11:00:00.000Z",
              editVersion: 2,
            },
          };
        return new Response(JSON.stringify(current));
      }
      if (url.endsWith("/doctors"))
        return new Response(JSON.stringify({ items: [doctor] }));
      return new Response(
        JSON.stringify({
          items: current.status === "completed" ? [] : [current],
          doctors: [doctor],
        }),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    renderPatient(<VisitsPage lang={lang} onExpired={() => {}} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: t.start }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.getAttribute("dir")).toBe(lang === "ar" ? "rtl" : "ltr");
    await user.click(within(dialog).getByRole("button", { name: t.start }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await user.click(await screen.findByRole("button", { name: t.complete }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: t.complete,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(await screen.findByText(t.empty)).toBeTruthy();
    expect(
      fetcher.mock.calls
        .filter(([, o]) => o?.method === "POST")
        .map(([u]) => u),
    ).toEqual([
      `/api/clinic/visits/${row.id}/start`,
      `/api/clinic/visits/${row.id}/complete`,
    ]);
  },
);
it.each(["ar", "fr"] as const)(
  "requires named previous confirmation and reviews lost compound reply without resending in %s",
  async (lang) => {
    const t = translations[lang].visits,
      e = translations[lang].editing;
    const prior = {
      ...row,
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      patient: {
        ...patient,
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        name: "Previous patient",
      },
      status: "with_doctor",
      editVersion: 2,
      visit: {
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        status: "in_progress",
        startedAt: "2026-11-13T09:10:00.000Z",
        recordedEndAt: null,
        editVersion: 1,
      },
    };
    const entered = {
      ...row,
      status: "with_doctor",
      editVersion: 2,
      visit: {
        ...prior.visit,
        id: "11111111-1111-4111-8111-111111111111",
        startedAt: "2026-11-13T10:00:00.000Z",
      },
    };
    const finished = {
      ...prior,
      status: "completed",
      editVersion: 3,
      recordedEndAt: "2026-11-13T10:00:00.000Z",
      visit: {
        ...prior.visit,
        status: "completed",
        editVersion: 2,
        recordedEndAt: "2026-11-13T10:00:00.000Z",
      },
    };
    let wrote = false;
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        wrote = true;
        throw new TypeError("lost reply");
      }
      if (url.endsWith("/doctors"))
        return new Response(JSON.stringify({ items: [doctor] }));
      if (url.endsWith(`/${row.id}`))
        return new Response(JSON.stringify(entered));
      if (url.endsWith(`/${prior.id}`))
        return new Response(JSON.stringify(finished));
      return new Response(
        JSON.stringify({
          items: wrote ? [entered] : [prior, row],
          doctors: [doctor],
        }),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    renderPatient(<VisitsPage lang={lang} onExpired={() => {}} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: t.start }));
    const dialog = screen.getByRole("alertdialog");
    expect(
      within(dialog).getAllByText(/Previous patient/).length,
    ).toBeGreaterThan(0);
    await user.click(
      within(dialog).getByRole("button", { name: t.completePrevious }),
    );
    await screen.findByText(e.uncertain);
    expect(
      within(dialog)
        .getByRole("button", { name: t.completePrevious })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: e.review }));
    await within(dialog).findByRole("button", { name: e.useLatest });
    const posts = fetcher.mock.calls.filter(([, o]) => o?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1]!.body))).toEqual({
      editVersion: 1,
      previous: {
        attendanceId: prior.id,
        editVersion: 2,
        visitVersion: 1,
        confirmed: true,
      },
    });
  },
);
