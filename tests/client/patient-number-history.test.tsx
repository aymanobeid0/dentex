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
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPatient } from "./render-patient";
import { PatientPage } from "../../client/features/patients/pages/PatientPage";
import { translations } from "../../client/shared/i18n";
import { App } from "../../client/app/App";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});
it.each(["ar", "fr"] as const)(
  "looks up one old reference and restores keyboard focus in %s",
  async (lang) => {
    const fetcher = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("numbering-history")
              ? { id: "mapped", name: "Mapped patient", fileNumber: "2" }
              : { items: [], page: 1, hasNext: false },
          ),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    const view = renderPatient(
      <PatientPage
        lang={lang}
        canRead
        canWrite
        canLookupOldNumber
        onExpired={() => {}}
      />,
    );
    const title =
      lang === "ar" ? "مراجعة رقم ملف قديم" : "Retrouver un ancien numéro";
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: title });
    await user.click(trigger);
    const input = screen.getByRole("textbox", {
      name: lang === "ar" ? "رقم الملف القديم" : "Ancien numéro de dossier",
    });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.submit(input.closest("form")!);
    const link = await screen.findByRole("link", { name: "Mapped patient" });
    expect(link.getAttribute("href")).toBe("#patients/mapped");
    expect(screen.getByText("2")).toBeTruthy();
    expect(
      fetcher.mock.calls.filter(([url]) => url.includes("numbering-history")),
    ).toHaveLength(1);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    expect(screen.queryByText("Mapped patient")).toBeNull();
    view.rerender(
      <PatientPage
        lang={lang}
        canRead
        canWrite
        canLookupOldNumber={false}
        onExpired={() => {}}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: title })).toBeNull();
  },
);

it.each(["role", "session"] as const)(
  "discards completed and late history data on %s replacement",
  async (change) => {
    let admin = true,
      username = "qa",
      finish!: (response: Response) => void,
      signal: AbortSignal | undefined;
    let attempt = 0;
    const t = translations.fr.patients;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url === "/api/auth/me")
          return new Response(
            JSON.stringify({
              kind: "clinic",
              username,
              name: "QA",
              clinic: { id: "clinic", name: "Clinic", code: "2000" },
              roles: admin ? ["admin"] : ["dentist"],
              permissions: ["patients.read"],
            }),
          );
        if (url.includes("numbering-history")) {
          attempt++;
          if (attempt === 1)
            return new Response(
              JSON.stringify({
                id: "mapped",
                name: "Private mapping",
                fileNumber: "2",
              }),
            );
          signal = options?.signal ?? undefined;
          return new Promise<Response>((resolve) => {
            finish = resolve;
          });
        }
        return new Response(
          JSON.stringify({ items: [], page: 1, hasNext: false }),
        );
      }),
    );
    localStorage.setItem("dentex-lang", "fr");
    window.history.replaceState(null, "", "#patients");
    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: t.oldNumberLookup }),
    );
    const input = screen.getByRole("textbox", { name: t.oldNumber });
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.submit(input.closest("form")!);
    await screen.findByRole("link", { name: "Private mapping" });
    fireEvent.change(input, { target: { value: "11" } });
    expect(screen.queryByText("Private mapping")).toBeNull();
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    if (change === "role") admin = false;
    else username = "replacement";
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      finish(
        new Response(
          JSON.stringify({
            id: "late",
            name: "Late private mapping",
            fileNumber: "3",
          }),
        ),
      );
    });
    expect(screen.queryByText("Late private mapping")).toBeNull();
    if (change === "role") {
      admin = true;
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      fireEvent(document, new Event("visibilitychange"));
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
      fireEvent(document, new Event("visibilitychange"));
    }
    fireEvent.click(
      await screen.findByRole("button", { name: t.oldNumberLookup }),
    );
    expect(
      (screen.getByRole("textbox", { name: t.oldNumber }) as HTMLInputElement)
        .value,
    ).toBe("");
    expect(screen.queryByText("Private mapping")).toBeNull();
    expect(screen.queryByText("Late private mapping")).toBeNull();
  },
);

it("clears results on rejected refresh, handles missing references and cancels a closed request", async () => {
  let status = 200,
    finish!: (response: Response) => void,
    signal: AbortSignal | undefined;
  const t = translations.fr.patients;
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (!url.includes("numbering-history"))
      return new Response(
        JSON.stringify({ items: [], page: 1, hasNext: false }),
      );
    if (status === 0) {
      signal = options?.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    }
    return new Response(
      JSON.stringify(
        status === 200
          ? { id: "mapped", name: "Mapped secret", fileNumber: "2" }
          : { error: status === 404 ? "not_found" : "forbidden" },
      ),
      { status },
    );
  });
  vi.stubGlobal("fetch", fetcher);
  renderPatient(
    <PatientPage
      lang="fr"
      canRead
      canWrite
      canLookupOldNumber
      onExpired={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: t.oldNumberLookup }));
  const input = screen.getByRole("textbox", { name: t.oldNumber });
  const search = () => fireEvent.submit(input.closest("form")!);
  fireEvent.change(input, { target: { value: "0" } });
  search();
  await screen.findByText(t.oldNumberInvalid);
  expect(
    fetcher.mock.calls.filter(([url]) => url.includes("numbering-history")),
  ).toHaveLength(0);
  fireEvent.change(input, { target: { value: "10" } });
  search();
  await screen.findByText("Mapped secret");
  status = 403;
  search();
  await screen.findByText(t.denied);
  expect(screen.queryByText("Mapped secret")).toBeNull();
  status = 404;
  fireEvent.change(input, { target: { value: "11" } });
  search();
  await screen.findByText(t.oldNumberMissing);
  status = 0;
  fireEvent.change(input, { target: { value: "12" } });
  search();
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish(
      new Response(
        JSON.stringify({
          id: "late",
          name: "Late closed mapping",
          fileNumber: "3",
        }),
      ),
    );
  });
  fireEvent.click(screen.getByRole("button", { name: t.oldNumberLookup }));
  expect(screen.queryByText("Late closed mapping")).toBeNull();
});

it("stops history polling while closed and reports offline and network failures", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const t = translations.fr.patients;
  let networkFailure = false;
  const fetcher = vi.fn(async (url: string) => {
    if (!url.includes("numbering-history"))
      return new Response(
        JSON.stringify({ items: [], page: 1, hasNext: false }),
      );
    if (networkFailure) throw new TypeError("offline transport");
    return new Response(
      JSON.stringify({
        id: "mapped",
        name: "Visible mapping",
        fileNumber: "2",
      }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  renderPatient(
    <PatientPage
      lang="fr"
      canRead
      canWrite
      canLookupOldNumber
      onExpired={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: t.oldNumberLookup }));
  const input = screen.getByRole("textbox", { name: t.oldNumber });
  fireEvent.change(input, { target: { value: "10" } });
  fireEvent.submit(input.closest("form")!);
  await screen.findByText("Visible mapping");
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: false,
  });
  fireEvent(window, new Event("offline"));
  await within(screen.getByRole("dialog")).findByText(t.staleData);
  expect(
    (
      screen
        .getByRole("dialog")
        .querySelector("button.primary") as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  fireEvent(window, new Event("online"));
  const before = fetcher.mock.calls.filter(([url]) =>
    url.includes("numbering-history"),
  ).length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(45000);
  });
  expect(
    fetcher.mock.calls.filter(([url]) => url.includes("numbering-history")),
  ).toHaveLength(before);
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  fireEvent(window, new Event("online"));
  networkFailure = true;
  fireEvent.click(screen.getByRole("button", { name: t.oldNumberLookup }));
  const reopened = screen.getByRole("textbox", { name: t.oldNumber });
  fireEvent.change(reopened, { target: { value: "11" } });
  fireEvent.submit(reopened.closest("form")!);
  await screen.findByText(t.network);
  expect(screen.queryByText("Visible mapping")).toBeNull();
});
