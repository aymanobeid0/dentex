// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { application } from "./app";
import { translations } from "../../client/shared/i18n";
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  fireEvent(window, new Event("online"));
});

it("does not authenticate a malformed successful clinic login response", async () => {
  localStorage.setItem("dentex-lang", "fr");
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (_url: string, options?: RequestInit) =>
        new Response(
          JSON.stringify(
            options?.method === "POST"
              ? { kind: "clinic", username: "broken" }
              : { error: "unauthorized" },
          ),
          { status: options?.method === "POST" ? 200 : 401 },
        ),
    ),
  );
  render(application());
  const t = translations.fr.app;
  fireEvent.change(await screen.findByLabelText(t.code), {
    target: { value: "2000" },
  });
  fireEvent.change(screen.getByLabelText(t.user), {
    target: { value: "synthetic-user" },
  });
  fireEvent.change(screen.getByLabelText(t.password), {
    target: { value: "synthetic-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: t.login }));
  await screen.findByText(t.uncertain);
  expect(screen.queryByRole("button", { name: t.logout })).toBeNull();
});

it.each([408, 500])(
  "keeps login outcome unconfirmed after HTTP%s instead of implying a definite failure",
  async (status) => {
    localStorage.setItem("dentex-lang", "fr");
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
    let writes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method === "POST") writes++;
        return new Response(
          JSON.stringify({
            error: options?.method === "POST" ? "server_error" : "unauthorized",
          }),
          { status: options?.method === "POST" ? status : 401 },
        );
      }),
    );
    render(application());
    const t = translations.fr.app;
    fireEvent.change(await screen.findByLabelText(t.code), {
      target: { value: "2000" },
    });
    fireEvent.change(screen.getByLabelText(t.user), {
      target: { value: "synthetic-user" },
    });
    fireEvent.change(screen.getByLabelText(t.password), {
      target: { value: "synthetic-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: t.login }));
    await screen.findByText(t.uncertain);
    expect(writes).toBe(1);
    expect(screen.queryByRole("button", { name: t.logout })).toBeNull();
  },
);

it("does not confirm logout before a204 and never queues another logout after reconnection", async () => {
  localStorage.setItem("dentex-lang", "fr");
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  let writes = 0,
    finish!: (r: Response) => void;
  const account = { kind: "platform", username: "platform" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        writes++;
        return new Promise<Response>((resolve) => (finish = resolve));
      }
      return new Response(
        JSON.stringify(url === "/api/auth/me" ? account : []),
      );
    }),
  );
  render(application());
  const t = translations.fr.app;
  const logout = await screen.findByRole("button", { name: t.logout });
  fireEvent.click(logout);
  fireEvent.click(logout);
  await waitFor(() => expect(writes).toBe(1));
  expect(screen.queryByLabelText(t.code)).toBeNull();
  finish(new Response("{}", { status: 200 }));
  await screen.findByText(t.uncertain);
  expect(screen.getByRole("button", { name: t.logout })).toBeTruthy();
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
  fireEvent.click(screen.getByRole("button", { name: t.logout }));
  await waitFor(() => expect(writes).toBe(2));
  finish(new Response(null, { status: 204 }));
  await screen.findByRole("heading", { name: t.title });
  expect(window.location.pathname).toBe("/platform/login");
});
it("sends only one login while confirmation is pending and never replays it after a lost reply", async () => {
  localStorage.setItem("dentex-lang", "fr");
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  let writes = 0,
    fail!: (error: Error) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        writes++;
        return new Promise<Response>((_resolve, reject) => (fail = reject));
      }
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
      });
    }),
  );
  render(application());
  const t = translations.fr.app;
  fireEvent.change(await screen.findByLabelText(t.code), {
    target: { value: "2000" },
  });
  fireEvent.change(screen.getByLabelText(t.user), {
    target: { value: "synthetic-user" },
  });
  fireEvent.change(screen.getByLabelText(t.password), {
    target: { value: "synthetic-password" },
  });
  const form = screen.getByRole("button", { name: t.login }).closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  await waitFor(() => expect(writes).toBe(1));
  fail(Error("lost reply"));
  await screen.findByText(t.uncertain);
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
  expect((screen.getByLabelText(t.password) as HTMLInputElement).value).toBe(
    "synthetic-password",
  );
});
