// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPatient } from "./render-patient";
import { AccountPassword } from "../../client/features/account/components/AccountPassword";
import { translations } from "../../client/shared/i18n";
import { App } from "../../client/app/App";
import { render, act } from "@testing-library/react";
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  fireEvent(window, new Event("online"));
});

it.each([204, 200, 400, 500, 0])(
  "waits for confirmation and never retries a password write (%s)",
  async (status) => {
    let finish!: (r: Response) => void,
      reject!: (error: Error) => void,
      writes = 0;
    const changed = vi.fn(),
      expired = vi.fn(),
      t = translations.fr.accountPassword;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        writes++;
        return new Promise<Response>((resolve, fail) => {
          finish = resolve;
          reject = fail;
        });
      }),
    );
    renderPatient(
      <AccountPassword lang="fr" onExpired={expired} onChanged={changed} />,
    );
    fireEvent.click(screen.getByRole("button", { name: t.title }));
    fireEvent.change(screen.getByLabelText(t.current), {
      target: { value: "synthetic-current" },
    });
    fireEvent.change(screen.getByLabelText(t.next), {
      target: { value: "synthetic-next" },
    });
    const save = screen.getByRole("button", { name: t.save });
    fireEvent.click(save);
    fireEvent.submit(save.closest("form")!);
    await waitFor(() => expect(writes).toBe(1));
    expect(changed).not.toHaveBeenCalled();
    expect((screen.getByLabelText(t.next) as HTMLInputElement).disabled).toBe(
      true,
    );
    if (status === 0) reject(Error("lost reply"));
    else
      finish(
        new Response(
          status === 204
            ? null
            : JSON.stringify({
                error: status === 400 ? "incorrect_password" : "server_error",
              }),
          { status },
        ),
      );
    if (status === 204) {
      await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
      expect(screen.queryByLabelText(t.current)).toBeNull();
    } else {
      await screen.findByText(status === 400 ? t.incorrect : t.uncertain);
      expect((screen.getByLabelText(t.current) as HTMLInputElement).value).toBe(
        "synthetic-current",
      );
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
      expect((save as HTMLButtonElement).disabled).toBe(status !== 400);
      if (status !== 400) {
        fireEvent.click(screen.getByRole("button", { name: t.signInAgain }));
        fireEvent.click(
          await screen.findByRole("button", {
            name: translations.fr.editing.discard,
          }),
        );
        expect(expired).toHaveBeenCalledTimes(1);
      }
    }
  },
);

const identity = {
  kind: "clinic",
  username: "account-user",
  name: "Account user",
  clinic: { id: "one", name: "Clinic one", code: "2000" },
  roles: ["admin"],
  permissions: ["employees.manage"],
};
it("protects account secrets during navigation and logout, while identity updates do not overwrite them", async () => {
  localStorage.setItem("dentex-lang", "fr");
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  let logouts = 0, name = identity.name;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/auth/logout") {
        logouts++;
        return new Response(null, { status: 204 });
      }
      return new Response(
        JSON.stringify(url === "/api/auth/me" ? {...identity,name} : []),
      );
    }),
  );
  render(<App />);
  const t = translations.fr;
  fireEvent.click(
    await screen.findByRole("button", { name: t.accountPassword.title }),
  );
  fireEvent.change(screen.getByLabelText(t.accountPassword.current), {
    target: { value: "synthetic-current" },
  });
  name="Updated account user";
  Object.defineProperty(navigator,'onLine',{value:false,configurable:true});fireEvent(window,new Event('offline'));
  Object.defineProperty(navigator,'onLine',{value:true,configurable:true});fireEvent(window,new Event('online'));
  await screen.findByText('Updated account user');
  fireEvent.click(screen.getByRole("button", { name: t.app.employees }));
  await screen.findByRole("alertdialog");
  fireEvent.click(screen.getByRole("button", { name: t.editing.stay }));
  expect(
    (screen.getByLabelText(t.accountPassword.current) as HTMLInputElement)
      .value,
  ).toBe("synthetic-current");
  fireEvent.click(screen.getByRole("button", { name: t.app.logout }));
  await screen.findByRole("alertdialog");
  expect(logouts).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: t.editing.discard }));
  await screen.findByLabelText(t.app.code);
  expect(logouts).toBe(1);
  expect(Object.keys(localStorage)).toEqual(["dentex-lang"]);
  localStorage.clear();
});

it("ignores a late password success after the session has expired", async () => {
  localStorage.setItem("dentex-lang", "fr");
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  let finish!: (r: Response) => void,
    expired = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST")
        return new Promise<Response>((resolve) => (finish = resolve));
      return new Response(
        JSON.stringify(expired ? { error: "unauthorized" } : identity),
        { status: expired ? 401 : 200 },
      );
    }),
  );
  render(<App />);
  const t = translations.fr;
  fireEvent.click(
    await screen.findByRole("button", { name: t.accountPassword.title }),
  );
  fireEvent.change(screen.getByLabelText(t.accountPassword.current), {
    target: { value: "synthetic-current" },
  });
  fireEvent.change(screen.getByLabelText(t.accountPassword.next), {
    target: { value: "synthetic-next" },
  });
  fireEvent.click(screen.getByRole("button", { name: t.accountPassword.save }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  expired = true;
  fireEvent(window, new Event("focus"));
  // Reconnection revalidates the identity and retires all earlier writes.
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
  await screen.findByLabelText(t.app.code);
  await act(async () => finish(new Response(null, { status: 204 })));
  expect(screen.queryByText(t.app.passwordChanged)).toBeNull();
  expect(screen.queryByLabelText(t.accountPassword.current)).toBeNull();
  localStorage.clear();
});
it.each(["ar", "fr"] as const)(
  "guards cancelling a %s password draft and clears it only after explicit discard",
  async (lang) => {
    const t = translations[lang];
    renderPatient(
      <AccountPassword lang={lang} onExpired={() => {}} onChanged={() => {}} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: t.accountPassword.title }),
    );
    fireEvent.change(screen.getByLabelText(t.accountPassword.current), {
      target: { value: "synthetic-current" },
    });
    fireEvent.change(screen.getByLabelText(t.accountPassword.next), {
      target: { value: "synthetic-next" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: t.accountPassword.cancel }),
    );
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: t.editing.stay }));
    expect(
      (screen.getByLabelText(t.accountPassword.current) as HTMLInputElement)
        .value,
    ).toBe("synthetic-current");
    fireEvent.click(
      screen.getByRole("button", { name: t.accountPassword.cancel }),
    );
    fireEvent.click(screen.getByRole("button", { name: t.editing.discard }));
    fireEvent.click(
      await screen.findByRole("button", { name: t.accountPassword.title }),
    );
    expect(
      (screen.getByLabelText(t.accountPassword.current) as HTMLInputElement)
        .value,
    ).toBe("");
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  },
);
