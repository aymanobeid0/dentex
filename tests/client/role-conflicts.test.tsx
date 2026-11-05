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
import { RolePermissionsPage } from "../../client/features/roles/pages/RolePermissionsPage";
afterEach(() => {
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  fireEvent(window, new Event("online"));
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("preserves grant choices after conflict and requires explicit latest-version review", async () => {
  let version = 1,
    writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "PUT") {
        writes++;
        expect(JSON.parse(options.body as string).editVersion).toBe(1);
        version = 2;
        return new Response(JSON.stringify({ error: "edit_conflict" }), {
          status: 409,
        });
      }
      return new Response(
        JSON.stringify({
          roles: [
            {
              id: "d",
              key: "dentist",
              editVersion: version,
              permissions: version === 1 ? ["patients.read"] : [],
            },
          ],
          permissions: ["patients.read", "patients.write"],
        }),
      );
    }),
  );
  renderPatient(<RolePermissionsPage lang="fr" onExpired={() => {}} />);
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "Modifier les patients" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Enregistrer les autorisations" }),
  );
  await screen.findByText(/autre utilisateur/);
  expect(
    screen
      .getByRole("checkbox", { name: "Modifier les patients" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  fireEvent.click(
    screen.getByRole("button", { name: "Enregistrer les autorisations" }),
  );
  expect(writes).toBe(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Examiner la version actuelle" }),
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Charger la version actuelle et recommencer",
    }),
  );
  expect(
    screen
      .getByRole("checkbox", { name: "Modifier les patients" })
      .getAttribute("aria-checked"),
  ).toBe("false");
});
it.each([false, true])(
  "invalidates grant reviews on denied reads, including late responses (%s)",
  async (late) => {
    let reads = 0,
      denied = false,
      finish!: (response: Response) => void;
    const catalog = (version: number) => ({
      roles: [
        {
          id: "d",
          key: "dentist",
          editVersion: version,
          permissions: version === 1 ? ["patients.read"] : [],
        },
      ],
      permissions: ["patients.read", "patients.write"],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method === "PUT")
          return new Response(JSON.stringify({ error: "edit_conflict" }), {
            status: 409,
          });
        reads++;
        if (reads === 2 && late)
          return new Promise<Response>((resolve) => (finish = resolve));
        return denied
          ? new Response(JSON.stringify({ error: "forbidden" }), {
              status: 403,
            })
          : new Response(JSON.stringify(catalog(reads === 2 ? 2 : 1)));
      }),
    );
    renderPatient(<RolePermissionsPage lang="fr" onExpired={() => {}} />);
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Modifier les patients" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Enregistrer les autorisations" }),
    );
    await screen.findByText(/autre utilisateur/);
    fireEvent.click(
      screen.getByRole("button", { name: "Examiner la version actuelle" }),
    );
    if (late) await waitFor(() => expect(finish).toBeTypeOf("function"));
    else
      await screen.findByRole("button", {
        name: "Différences examinées ; conserver mon brouillon",
      });
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
    await waitFor(() => expect(screen.queryByRole("checkbox")).toBeNull());
    if (late) finish(new Response(JSON.stringify(catalog(2))));
    denied = false;
    reconnect();
    await screen.findByRole("checkbox", { name: "Modifier les patients" });
    expect(
      screen.queryByRole("button", {
        name: "Différences examinées ; conserver mon brouillon",
      }),
    ).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Enregistrer les autorisations",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  },
);
it("polls displayed grants without replacing a draft and stops in a hidden tab", async () => {
  vi.useFakeTimers();
  let version = 1,
    reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      reads++;
      return new Response(
        JSON.stringify({
          roles: [
            {
              id: "d",
              key: "dentist",
              editVersion: version,
              permissions: version === 1 ? ["patients.read"] : [],
            },
          ],
          permissions: ["patients.read", "patients.write"],
        }),
      );
    }),
  );
  renderPatient(<RolePermissionsPage lang="fr" onExpired={() => {}} />);
  const advance = async (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  await advance(50);
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Modifier les patients" }),
  );
  version = 2;
  await advance(15050);
  expect(screen.getByText(/version d’origine a changé/)).toBeTruthy();
  expect(
    screen
      .getByRole("checkbox", { name: "Modifier les patients" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(
    (
      screen.getByRole("button", {
        name: "Enregistrer les autorisations",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  const before = reads;
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  fireEvent(document, new Event("visibilitychange"));
  await advance(30050);
  expect(reads).toBe(before);
});
it.each([409, 500])(
  "keeps an Arabic grant draft and guards switching roles after rejected or uncertain save (%s)",
  async (status) => {
    let writes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method === "PUT") {
          writes++;
          return new Response(
            JSON.stringify({
              error: status === 409 ? "edit_conflict" : "server_error",
            }),
            { status },
          );
        }
        return new Response(
          JSON.stringify({
            roles: [
              {
                id: "d",
                key: "dentist",
                editVersion: 1,
                permissions: ["patients.read"],
              },
              { id: "r", key: "receptionist", editVersion: 1, permissions: [] },
            ],
            permissions: ["patients.read", "patients.write"],
          }),
        );
      }),
    );
    renderPatient(<RolePermissionsPage lang="ar" onExpired={() => {}} />);
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "تعديل بيانات المرضى" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "حفظ الصلاحيات" }));
    await screen.findByText(
      status === 409 ? /عدّل مستخدم آخر/ : /تعذر التأكد من نتيجة الحفظ/,
    );
    fireEvent.click(screen.getByRole("button", { name: "حفظ الصلاحيات" }));
    expect(writes).toBe(1);
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "استقبال" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.getAttribute("dir")).toBe("rtl");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(
      screen
        .getByRole("checkbox", { name: "تعديل بيانات المرضى" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "استقبال" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "تجاهل ومغادرة" }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("radio", { name: "استقبال" })
          .getAttribute("aria-checked"),
      ).toBe("true"),
    );
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
  },
);
