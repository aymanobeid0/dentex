import { translations } from "../../client/shared/i18n";
import "./ui-browser-apis";
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { App } from "../../client/app/App";
import { onlineManager } from "@tanstack/react-query";
import { renderPatient } from "./render-patient";
import { PatientList } from "../../client/features/patients/components/PatientList";

const identity = {
  kind: "clinic",
  username: "reader",
  name: "Reader",
  clinic: { id: "clinic-one", name: "Clinic one", code: "2000" },
  roles: ["dentist"],
  permissions: ["patients.read"],
};
const response = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});
const list = (name: string) => ({
  items: [
    {
      id: "one",
      name,
      fileNumber: "42",
      phone: "+22262112233",
      isChild: false,
    },
  ],
  page: 1,
  hasNext: false,
});
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
function setup() {
  localStorage.setItem("dentex-lang", "fr");
  window.location.hash = "#patients";
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  vi.useFakeTimers();
}
afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  window.location.hash = "";
});

it("refreshes the visible list every15 seconds without clearing the displayed rows", async () => {
  setup();
  let name = "Original patient";
  let finish!: (value: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/auth/me"
        ? response(identity)
        : name === "pending"
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : response(list(name)),
    ),
  );
  render(<App />);
  await advance(50);
  expect(screen.getByRole("button", { name: "Original patient" })).toBeTruthy();
  name = "pending";
  await advance(15000);
  expect(finish).toBeTypeOf("function");
  expect(screen.getByRole("button", { name: "Original patient" })).toBeTruthy();
  await act(async () => finish(response(list("Updated patient"))));
  await advance(50);
  expect(screen.getByRole("button", { name: "Updated patient" })).toBeTruthy();
});

it("updates only the open patient file and keeps it readable offline", async () => {
  setup();
  window.location.hash = "#patients/one";
  let name = "Original file";
  const fetcher = vi.fn(async (url: string) =>
    url === "/api/auth/me"
      ? response(identity)
      : response({
          ...list(name).items[0],
          gender: "female",
          birthDate: null,
          address: null,
          administrativeNote: null,
        }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<App />);
  await advance(50);
  expect(screen.getByRole("heading", { name: "Original file" })).toBeTruthy();
  name = "Updated file";
  await advance(15050);
  expect(screen.getByRole("heading", { name: "Updated file" })).toBeTruthy();
  expect(fetcher.mock.calls.some(([url]) => url.includes("?q="))).toBe(false);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  fireEvent(window, new Event("offline"));
  expect(screen.getByRole("heading", { name: "Updated file" })).toBeTruthy();
  expect(
    screen.getByText(translations.fr.patients.staleData),
  ).toBeTruthy();
});

it("never resurfaces cached rows after a permission rejection, including during a new debounce", async () => {
  setup();
  let denied = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/auth/me"
        ? response(identity)
        : denied
          ? response({ error: "forbidden" }, 403)
          : response(list("Private patient")),
    ),
  );
  render(<App />);
  await advance(50);
  expect(screen.getByRole("button", { name: "Private patient" })).toBeTruthy();
  denied = true;
  await advance(15050);
  expect(screen.queryByText("Private patient")).toBeNull();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "New" } });
  expect(screen.queryByText("Private patient")).toBeNull();
  await advance(350);
  expect(screen.queryByText("Private patient")).toBeNull();
});

it("pauses list polling while hidden/offline and revalidates only the current search on return", async () => {
  setup();
  const fetcher = vi.fn(async (url: string) =>
    url === "/api/auth/me"
      ? response(identity)
      : response(list("Visible patient")),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<App />);
  await advance(50);
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Marie" },
  });
  await advance(350);
  const reads = () => fetcher.mock.calls.filter(([url]) => url.includes("?q="));
  const before = reads().length;
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  fireEvent(document, new Event("visibilitychange"));
  await advance(45000);
  expect(reads()).toHaveLength(before);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  fireEvent(window, new Event("offline"));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  fireEvent(document, new Event("visibilitychange"));
  await advance(30000);
  expect(reads()).toHaveLength(before);
  expect(screen.getByRole("button", { name: "Visible patient" })).toBeTruthy();
  expect(
    screen.getByText(translations.fr.patients.staleData),
  ).toBeTruthy();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  fireEvent(window, new Event("online"));
  await advance(50);
  expect(reads().length).toBe(before + 1);
  expect(reads().at(-1)?.[0]).toContain("q=Marie&page=1");
});

it("does not let a poll or a visibility change bypass the search debounce or IME", async () => {
  setup();
  const fetcher = vi.fn(async (url: string) =>
    url === "/api/auth/me" ? response(identity) : response(list("Patient")),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<App />);
  await advance(50);
  await advance(14750);
  const input = screen.getByRole("searchbox");
  const reads = () => fetcher.mock.calls.filter(([url]) => url.includes("?q="));
  fireEvent.change(input, { target: { value: "New" } });
  await advance(200);
  fireEvent(document, new Event("visibilitychange"));
  expect(reads()).toHaveLength(1);
  await advance(100);
  expect(reads()).toHaveLength(2);
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: "مريم" } });
  await advance(30000);
  expect(reads()).toHaveLength(2);
  fireEvent.compositionEnd(input);
  await advance(299);
  expect(reads()).toHaveLength(2);
  await advance(51);
  expect(reads()).toHaveLength(3);
});

it("returns from a file to an empty search/page one and stops polling the file", async () => {
  setup();
  const fetcher = vi.fn(async (url: string) =>
    url === "/api/auth/me"
      ? response(identity)
      : url.includes("?")
        ? response(list("Patient"))
        : response({ ...list("Patient").items[0], gender: "female" }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<App />);
  await advance(50);
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Marie" },
  });
  fireEvent.submit(screen.getByRole("search"));
  await advance(50);
  window.location.hash = "#patients/one";
  fireEvent(window, new HashChangeEvent("hashchange"));
  await advance(50);
  expect(screen.getByRole("heading", { name: "Patient" })).toBeTruthy();
  const fileReads = () =>
    fetcher.mock.calls.filter(([url]) => url === "/api/clinic/patients/one")
      .length;
  const before = fileReads();
  fireEvent.click(screen.getByRole("button", { name: "Retour à la liste" }));
  await advance(50);
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  expect(
    fetcher.mock.calls.filter(([url]) => url.includes("?")).at(-1)?.[0],
  ).toBe("/api/clinic/patients?q=&page=1");
  await advance(15050);
  expect(fileReads()).toBe(before);
});

it("keeps same-search rows after bounded transient retries and explicitly warns about freshness", async () => {
  setup();
  let fail = false;
  const fetcher = vi.fn(async (url: string) =>
    url === "/api/auth/me"
      ? response(identity)
      : fail
        ? response(null, 503)
        : response(list("Loaded patient")),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<App />);
  await advance(50);
  fail = true;
  await advance(18100);
  expect(screen.getByRole("button", { name: "Loaded patient" })).toBeTruthy();
  expect(
    screen.getByText(translations.fr.patients.staleData),
  ).toBeTruthy();
  expect(fetcher.mock.calls.filter(([url]) => url.includes("?"))).toHaveLength(
    4,
  );
  expect(
    screen.queryByText("Aucun patient enregistré pour le moment."),
  ).toBeNull();
});

it("cancels a file read and ignores late JSON when a different file opens", async () => {
  setup();
  window.location.hash = "#patients/one";
  let finish!: (body: unknown) => void;
  let signal: AbortSignal | null | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url === "/api/auth/me") return response(identity);
      if (url.endsWith("/one")) {
        signal = options?.signal;
        return {
          ok: true,
          status: 200,
          json: () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        };
      }
      return response({
        ...list("Second file").items[0],
        id: "two",
        gender: "female",
      });
    }),
  );
  render(<App />);
  await advance(50);
  window.location.hash = "#patients/two";
  fireEvent(window, new HashChangeEvent("hashchange"));
  await advance(50);
  expect(signal?.aborted).toBe(true);
  await act(async () =>
    finish({ ...list("Wrong old file").items[0], gender: "female" }),
  );
  await advance(50);
  expect(screen.getByRole("heading", { name: "Second file" })).toBeTruthy();
  expect(screen.queryByText("Wrong old file")).toBeNull();
});

it("shares one initial read and one poll between simultaneous consumers of the same list", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => response(list("Shared patient")));
  vi.stubGlobal("fetch", fetcher);
  renderPatient(
    <>
      <PatientList onNavigate={() => {}} lang="fr" onExpired={() => {}} />
      <PatientList onNavigate={() => {}} lang="fr" onExpired={() => {}} />
    </>,
  );
  await advance(50);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await advance(15050);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.getAllByRole("button", { name: "Shared patient" })).toHaveLength(
    2,
  );
});

it("does not reveal another cached search while rechecking access after a403", async () => {
  setup();
  let denied = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/auth/me") return response(identity);
      if (denied && url.includes("q=Saved")) return new Promise(() => {});
      return denied
        ? response({ error: "forbidden" }, 403)
        : response(
            list(
              url.includes("q=Saved")
                ? "Private cached search"
                : "Default patient",
            ),
          );
    }),
  );
  render(<App />);
  await advance(50);
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Saved" },
  });
  await advance(350);
  expect(
    screen.getByRole("button", { name: "Private cached search" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Effacer la recherche" }));
  await advance(50);
  denied = true;
  await advance(15050);
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Saved" },
  });
  await advance(350);
  expect(screen.queryByText("Private cached search")).toBeNull();
});
