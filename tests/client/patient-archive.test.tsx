// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { renderPatient } from "./render-patient";
import { PatientPage } from "./legacy-patient";
import { translations } from "../../client/shared/i18n";
import userEvent from "@testing-library/user-event";
const patient = {
  id: "archive-patient",
  fileNumber: "42",
  name: "Patient archive",
  phone: "+22278112233",
  gender: "male",
  isChild: false,
  birthDate: null,
  address: null,
  administrativeNote: null,
  editVersion: 1,
  archived: false,
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});
it.each(["ar", "fr"] as const)(
  "confirms archive and restores the same file in %s",
  async (lang) => {
    window.history.replaceState(null, "", "#patients/archive-patient");
    const t = translations[lang].patients;
    let current = { ...patient },
      writes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          writes++;
          const body = JSON.parse(init.body as string);
          current = {
            ...current,
            archived: body.archived,
            editVersion: current.editVersion + 1,
          };
          return new Response(
            JSON.stringify({
              id: current.id,
              fileNumber: current.fileNumber,
              archived: current.archived,
              editVersion: current.editVersion,
            }),
          );
        }
        return new Response(JSON.stringify(current));
      }),
    );
    renderPatient(
      <PatientPage lang={lang} canRead canWrite onExpired={() => {}} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: t.archive }));
    const dialog = await screen.findByRole("alertdialog");
    expect(writes).toBe(0);
    fireEvent.click(
      within(dialog).getByRole("button", { name: t.confirmArchive }),
    );
    await screen.findByText(t.archivedHint);
    expect(screen.queryByRole("button", { name: t.edit })).toBeNull();
    expect(writes).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: t.restore }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: t.confirmRestore,
      }),
    );
    await screen.findByRole("button", { name: t.edit });
    expect(writes).toBe(2);
    expect(screen.getByText("42")).toBeTruthy();
  },
);
it("keeps an uncertain archive open, reviews the actual state and closes without another write", async () => {
  window.history.replaceState(null, "", "#patients/archive-patient");
  const t = translations.fr.patients;
  let current = { ...patient },
    writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        writes++;
        current = { ...current, archived: true, editVersion: 2 };
        throw new TypeError("lost reply");
      }
      return new Response(JSON.stringify(current));
    }),
  );
  renderPatient(
    <PatientPage lang="fr" canRead canWrite onExpired={() => {}} />,
  );
  fireEvent.click(await screen.findByRole("button", { name: t.archive }));
  let dialog = await screen.findByRole("alertdialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: t.confirmArchive }),
  );
  await within(dialog).findByText(t.archiveUncertain);
  fireEvent.click(within(dialog).getByRole("button", { name: t.cancelEdit }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: t.archive }));
  dialog = await screen.findByRole("alertdialog");
  expect(
    (
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: t.confirmArchive,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    (
      within(dialog).getByRole("button", {
        name: t.confirmArchive,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent(window, new Event("online"));
  fireEvent(window, new Event("focus"));
  expect(writes).toBe(1);
  fireEvent.click(within(dialog).getByRole("button", { name: t.reviewFile }));
  fireEvent.click(
    await within(dialog).findByRole("checkbox", {
      name: t.acceptCurrentStatus,
    }),
  );
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  await screen.findByText(t.archivedHint);
  expect(writes).toBe(1);
});
it("keeps a pending archive modal open and blocks duplicate confirmation", async () => {
  window.history.replaceState(null, "", "#patients/archive-patient");
  const t = translations.fr.patients;
  let writes = 0;
  let finish!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        writes++;
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }
      return new Response(JSON.stringify(patient));
    }),
  );
  renderPatient(
    <PatientPage lang="fr" canRead canWrite onExpired={() => {}} />,
  );
  fireEvent.click(await screen.findByRole("button", { name: t.archive }));
  const dialog = await screen.findByRole("alertdialog");
  const confirm = within(dialog).getByRole("button", {
    name: t.confirmArchive,
  });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await waitFor(() => expect(writes).toBe(1));
  expect((confirm as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(dialog).getByRole("button", { name: t.cancelEdit }));
  expect(screen.queryByRole("alertdialog")).toBeTruthy();
  finish(
    new Response(
      JSON.stringify({
        id: patient.id,
        fileNumber: "42",
        archived: true,
        editVersion: 2,
      }),
    ),
  );
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
});
it("filters shared phone results through Radix and starts each filter from page one", async () => {
  const t = translations.fr.patients;
  const queries: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      queries.push(url);
      const params = new URL(url, "http://local").searchParams;
      const archived = params.get("status") === "archived";
      return new Response(
        JSON.stringify({
          items: [
            {
              ...patient,
              name: archived ? "Archived contact" : "Active contact",
              archived,
            },
          ],
          page: Number(params.get("page") || 1),
          hasNext: true,
        }),
      );
    }),
  );
  renderPatient(
    <PatientPage lang="fr" canRead canWrite onExpired={() => {}} />,
  );
  await screen.findByRole("button", { name: "Active contact" });
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "78112233" },
  });
  fireEvent.submit(screen.getByRole("search"));
  await waitFor(() => expect(queries.at(-1)).toContain("q=78112233"));
  fireEvent.click(screen.getByRole("button", { name: t.next }));
  await waitFor(() => expect(queries.at(-1)).toContain("page=2"));
  const user = userEvent.setup();
  screen.getByRole("combobox", { name: t.statusFilter }).focus();
  await user.keyboard("{ArrowDown}");
  await user.click(screen.getByRole("option", { name: t.archived }));
  await screen.findByRole("button", { name: "Archived contact" });
  expect(queries.at(-1)).toContain("q=78112233");
  expect(queries.at(-1)).toContain("status=archived");
  expect(queries.at(-1)).toContain("page=1");
  expect(screen.queryByRole("button", { name: "Active contact" })).toBeNull();
});
it("hides patient data immediately when a manual review is denied before the identity refresh", async () => {
  window.history.replaceState(null, "", "#patients/archive-patient");
  const t = translations.fr.patients;
  let denied = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        denied = true;
        throw new TypeError("lost reply");
      }
      return new Response(
        JSON.stringify(denied ? { error: "forbidden" } : patient),
        { status: denied ? 403 : 200 },
      );
    }),
  );
  renderPatient(
    <PatientPage lang="fr" canRead canWrite onExpired={() => {}} />,
  );
  fireEvent.click(await screen.findByRole("button", { name: t.archive }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: t.confirmArchive }),
  );
  await within(dialog).findByText(t.archiveUncertain);
  fireEvent.click(within(dialog).getByRole("button", { name: t.reviewFile }));
  await within(dialog).findByText(t.reviewFailed);
  fireEvent.click(within(dialog).getByRole("button", { name: t.cancelEdit }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(screen.queryByRole("heading", { name: patient.name })).toBeNull();
  expect(screen.queryByText(patient.phone)).toBeNull();
});
it.each([
  "conflict",
  "malformed",
  "server",
  "timeout",
  "denied",
  "expired",
] as const)(
  "requires review after archive %s without pretending success",
  async (mode) => {
    window.history.replaceState(null, "", "#patients/archive-patient");
    const t = translations.fr.patients;
    const expired = vi.fn();
    let writes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          writes++;
          return new Response(
            JSON.stringify(
              mode === "malformed"
                ? {
                    id: patient.id,
                    fileNumber: 42,
                    editVersion: 2,
                    archived: true,
                  }
                : {
                    error: mode === "conflict" ? "edit_conflict" : "forbidden",
                  },
            ),
            {
              status: {
                conflict: 409,
                malformed: 200,
                server: 500,
                timeout: 408,
                denied: 403,
                expired: 401,
              }[mode],
            },
          );
        }
        return new Response(JSON.stringify(patient));
      }),
    );
    renderPatient(
      <PatientPage lang="fr" canRead canWrite onExpired={expired} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: t.archive }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: t.confirmArchive }),
    );
    if (mode === "expired")
      await waitFor(() => expect(expired).toHaveBeenCalled());
    else await within(dialog).findByRole("alert");
    expect(writes).toBe(1);
    expect(screen.queryByRole("alertdialog")).toBeTruthy();
    if (mode !== "expired")
      expect(
        (
          within(dialog).getByRole("button", {
            name: t.confirmArchive,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
  },
);
