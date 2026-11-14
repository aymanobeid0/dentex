// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, it, expect, vi } from "vitest";
import { cleanup, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPatient } from "./render-patient";
import { PatientVisits } from "../../client/features/visits";
import { translations } from "../../client/shared/i18n";
const patient = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Correction patient",
  fileNumber: "9",
  archived: false,
};
const doctor = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Correction doctor",
  eligible: true,
};
const initial = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  patient,
  doctor,
  status: "waiting",
  arrivedAt: new Date().toISOString(),
  recordedEndAt: null,
  editVersion: 1,
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(["ar", "fr"] as const)(
  "corrects with a reason and shows named before/after audit in %s",
  async (lang) => {
    const t = translations[lang].visits;
    let row: any = initial;
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        const input = JSON.parse(String(options.body));
        row = {
          ...initial,
          status: "left_before_entry",
          recordedEndAt: new Date().toISOString(),
          editVersion: 2,
          corrections: [
            {
              id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              kind: "mark_left",
              actor: { id: doctor.id, name: "Correction actor" },
              reason: input.reason,
              recordedAt: new Date().toISOString(),
              before: { status: "waiting", recordedEndAt: null },
              after: {
                status: "left_before_entry",
                recordedEndAt: new Date().toISOString(),
              },
            },
          ],
        };
      }
      return new Response(
        JSON.stringify(
          url.includes("/patient/")
            ? { items: [row], page: 1, hasNext: false }
            : row,
        ),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    renderPatient(
      <PatientVisits
        patient={patient}
        lang={lang}
        canRead
        onExpired={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: t.correctStatus }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: t.correctionReason }),
      "Wrong waiting state",
    );
    await user.click(
      within(dialog).getByRole("button", { name: t.saveCorrection }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Correction actor")).toBeTruthy();
    expect(screen.getByText("Wrong waiting state")).toBeTruthy();
    const writes = fetcher.mock.calls.filter(([, o]) => o?.method === "PATCH");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0][1]?.body))).toEqual({
      kind: "mark_left",
      editVersion: 1,
      reason: "Wrong waiting state",
    });
  },
);

it.each(["ar", "fr"] as const)(
  "never repeats an uncertain delete and treats protected review 404 as absence, not success in %s",
  async (lang) => {
    const t = translations[lang].visits,
      dt = translations[lang].editing;
    let deleted = false;
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "DELETE") {
        deleted = true;
        throw new TypeError("lost reply");
      }
      if (url.includes("/patient/"))
        return new Response(
          JSON.stringify({ items: [initial], page: 1, hasNext: false }),
        );
      return deleted
        ? new Response(JSON.stringify({ error: "not_found" }), { status: 404 })
        : new Response(JSON.stringify(initial));
    });
    vi.stubGlobal("fetch", fetcher);
    renderPatient(
      <PatientVisits
        patient={patient}
        lang={lang}
        canRead
        onExpired={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: t.deleteFalseAttendance }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.dblClick(
      within(dialog).getByRole("button", { name: t.confirmFalseDelete }),
    );
    expect(await within(dialog).findByText(dt.uncertain)).toBeTruthy();
    expect(
      fetcher.mock.calls.filter(([, o]) => o?.method === "DELETE"),
    ).toHaveLength(1);
    await user.click(within(dialog).getByRole("button", { name: dt.review }));
    expect(await within(dialog).findByText(t.correctionMissing)).toBeTruthy();
    expect(
      (
        within(dialog).getByRole("button", {
          name: t.confirmFalseDelete,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      fetcher.mock.calls.filter(([, o]) => o?.method === "DELETE"),
    ).toHaveLength(1);
  },
);
it.each(["ar", "fr"] as const)(
  "requires confirmation for invalid entry and preserves reason across lost reply and manual review in %s",
  async (lang) => {
    const t = translations[lang].visits,
      dt = translations[lang].editing;
    const row: any = {
      ...initial,
      status: "with_doctor",
      editVersion: 2,
      visit: {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        status: "in_progress",
        startedAt: initial.arrivedAt,
        recordedEndAt: null,
        editVersion: 1,
      },
    };
    const fetcher = vi.fn(async (url: string, o?: RequestInit) => {
      if (o?.method === "PATCH") throw new TypeError("lost reply");
      return new Response(
        JSON.stringify(
          url.includes("/patient/")
            ? { items: [row], page: 1, hasNext: false }
            : row,
        ),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    renderPatient(
      <PatientVisits
        patient={patient}
        lang={lang}
        canRead
        onExpired={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: t.correctStatus }),
    );
    let dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: t.correctionReason }),
      "False entry",
    );
    await user.click(
      within(dialog).getByRole("button", { name: t.saveCorrection }),
    );
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText(t.invalidateDescription)).toBeTruthy();
    expect(
      fetcher.mock.calls.filter(([, o]) => o?.method === "PATCH"),
    ).toHaveLength(0);
    await user.dblClick(
      within(confirm).getByRole("button", { name: t.confirmInvalidation }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText(dt.uncertain)).toBeTruthy();
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: t.correctionReason,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("False entry");
    expect(
      fetcher.mock.calls.filter(([, o]) => o?.method === "PATCH"),
    ).toHaveLength(1);
    await user.click(within(dialog).getByRole("button", { name: dt.review }));
    await user.click(
      await within(dialog).findByRole("button", { name: dt.keepDraft }),
    );
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: t.correctionReason,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("False entry");
    expect(
      fetcher.mock.calls.filter(([, o]) => o?.method === "PATCH"),
    ).toHaveLength(1);
  },
);
it.each(["ar", "fr"] as const)(
  "hides sensitive correction content after a fresh authorization denial in %s",
  async (lang) => {
    const t = translations[lang].visits;
    const fetcher = vi.fn(async (url: string) =>
      url.includes("/patient/")
        ? new Response(
            JSON.stringify({ items: [initial], page: 1, hasNext: false }),
          )
        : new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
    );
    vi.stubGlobal("fetch", fetcher);
    renderPatient(
      <PatientVisits
        patient={patient}
        lang={lang}
        canRead
        onExpired={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: t.correctStatus }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(t.readDenied)).toBeTruthy();
    expect(within(dialog).queryByText(patient.name)).toBeNull();
    expect(within(dialog).queryByRole("textbox")).toBeNull();
  },
);

it("recognizes the new correction audit even when equal timestamps sort it before an existing correction", async () => {
  const t = translations.fr.visits,
    at = new Date().toISOString();
  const oldAudit = {
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    kind: "restore_waiting",
    actor: { id: doctor.id, name: "Previous actor" },
    reason: null,
    recordedAt: at,
    before: { status: "left_before_entry", recordedEndAt: at },
    after: { status: "waiting", recordedEndAt: null },
  };
  let row: any = { ...initial, corrections: [oldAudit] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, o?: RequestInit) => {
      if (o?.method === "PATCH")
        row = {
          ...initial,
          status: "left_before_entry",
          recordedEndAt: at,
          editVersion: 2,
          corrections: [
            {
              id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              kind: "mark_left",
              actor: { id: doctor.id, name: "Current actor" },
              reason: null,
              recordedAt: at,
              before: { status: "waiting", recordedEndAt: null },
              after: { status: "left_before_entry", recordedEndAt: at },
            },
            oldAudit,
          ],
        };
      return new Response(
        JSON.stringify(
          url.includes("/patient/")
            ? { items: [row], page: 1, hasNext: false }
            : row,
        ),
      );
    }),
  );
  renderPatient(
    <PatientVisits patient={patient} lang="fr" canRead onExpired={() => {}} />,
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: t.correctStatus }),
  );
  const dialog = await screen.findByRole("dialog");
  await waitFor(() =>
    expect(
      (
        within(dialog).getByRole("button", {
          name: t.saveCorrection,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  await user.click(
    within(dialog).getByRole("button", { name: t.saveCorrection }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(await screen.findByText("Current actor")).toBeTruthy();
});

it.each(["ar", "fr"] as const)(
  "protects a correction reason on Escape and preserves it after choosing to stay in %s",
  async (lang) => {
    const t = translations[lang].visits,
      dt = translations[lang].editing;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.includes("/patient/")
                ? { items: [initial], page: 1, hasNext: false }
                : initial,
            ),
          ),
      ),
    );
    renderPatient(
      <PatientVisits
        patient={patient}
        lang={lang}
        canRead
        onExpired={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: t.correctStatus }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: t.correctionReason }),
      "Keep this reason",
    );
    await user.keyboard("{Escape}");
    const discard = await screen.findByRole("alertdialog");
    expect(within(discard).getByText(dt.discardHint)).toBeTruthy();
    await user.click(within(discard).getByRole("button", { name: dt.stay }));
    expect(
      (
        within(screen.getByRole("dialog")).getByRole("textbox", {
          name: t.correctionReason,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Keep this reason");
  },
);

it("offers reopening a completed visit of today even when its legacy arrival is older", async () => {
  const t = translations.fr.visits,
    row = {
      ...initial,
      arrivedAt: new Date(Date.now() - 172800000).toISOString(),
      status: "completed",
      recordedEndAt: new Date().toISOString(),
      editVersion: 3,
      visit: {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        status: "completed",
        startedAt: new Date().toISOString(),
        recordedEndAt: new Date().toISOString(),
        editVersion: 2,
      },
    };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("/patient/")
              ? { items: [row], page: 1, hasNext: false }
              : row,
          ),
        ),
    ),
  );
  renderPatient(
    <PatientVisits patient={patient} lang="fr" canRead onExpired={() => {}} />,
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: t.correctStatus }),
  );
  expect(
    within(await screen.findByRole("dialog")).getByRole("combobox", {
      name: t.correctionKind,
    }).textContent,
  ).toBe(t.correctionChoices.reopen_visit);
});
