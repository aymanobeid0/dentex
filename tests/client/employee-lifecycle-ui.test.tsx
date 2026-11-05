// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { translations } from "../../client/shared/i18n";
import { renderPatient } from "./render-patient";
import { EmployeePage } from "../../client/features/employees/pages/EmployeePage";

afterEach(() => {
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  fireEvent(window, new Event("online"));
  cleanup();
  vi.unstubAllGlobals();
});

it.each(["ar", "fr"] as const)(
  "protects a %s reset draft, confirms only a 204 and never repeats a lost reply",
  async (lang) => {
    const t = translations[lang],
      e = t.employees,
      l = t.employeeLifecycle;
    let writes = 0,
      lost = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        if (options?.method === "POST") {
          writes++;
          if (lost) throw Error("lost reply");
          return new Response(null, { status: 204 });
        }
        return new Response(
          JSON.stringify(
            url.endsWith("/roles")
              ? employee.roles
              : url.endsWith("/e")
                ? employee
                : [employee],
          ),
        );
      }),
    );
    renderPatient(
      <EmployeePage
        lang={lang}
        canManageAdmins
        onExpired={() => {}}
        onIdentityChanged={async () => {}}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: l.reset }));
    fireEvent.change(screen.getByLabelText(l.newPassword), {
      target: { value: "private-reset-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: e.cancel }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.editing.stay }));
    expect(
      (screen.getByLabelText(l.newPassword) as HTMLInputElement).value,
    ).toBe("private-reset-password");
    fireEvent.click(screen.getByRole("button", { name: l.confirm }));
    await screen.findByText(t.writes.uncertain);
    expect(screen.queryByText(l.resetSaved)).toBeNull();
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
    await screen.findByText(t.writes.passwordHint);
    fireEvent.click(screen.getByRole("button", { name: t.writes.acknowledge }));
    lost = false;
    fireEvent.click(screen.getByRole("button", { name: l.confirm }));
    await screen.findByText(l.resetSaved);
    expect(writes).toBe(2);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  },
);

it("keeps status confirmation on last-admin failure and blocks duplicate in-flight submissions", async () => {
  let finish!: (r: Response) => void,
    writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        writes++;
        return new Promise<Response>((resolve) => (finish = resolve));
      }
      return new Response(
        JSON.stringify(url.endsWith("/roles") ? employee.roles : [employee]),
      );
    }),
  );
  renderPatient(
    <EmployeePage
      lang="fr"
      canManageAdmins
      onExpired={() => {}}
      onIdentityChanged={async () => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: translations.fr.employeeLifecycle.disable,
    }),
  );
  const confirm = screen.getByRole("button", { name: "Confirmer" });
  fireEvent.click(confirm);
  fireEvent.submit(confirm.closest("form")!);
  await waitFor(() => expect(writes).toBe(1));
  expect(
    screen.queryByText(translations.fr.employeeLifecycle.statusSaved),
  ).toBeNull();
  finish(
    new Response(JSON.stringify({ error: "last_admin" }), { status: 409 }),
  );
  await screen.findByText(translations.fr.employees.lastAdmin);
  expect((confirm as HTMLButtonElement).disabled).toBe(false);
});
const employee = {
  id: "e",
  name: "Employee",
  username: "employee",
  active: true,
  editVersion: 1,
  roles: [{ id: "d", key: "dentist" }],
};
it("does not confirm a status save whose successful reply contains malformed employee roles", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string, options?: RequestInit) =>
        new Response(
          JSON.stringify(
            options?.method === "PATCH"
              ? { ...employee, active: false, roles: [null] }
              : url.endsWith("/roles")
                ? employee.roles
                : [employee],
          ),
        ),
    ),
  );
  renderPatient(
    <EmployeePage
      lang="fr"
      canManageAdmins
      onExpired={() => {}}
      onIdentityChanged={async () => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: translations.fr.employeeLifecycle.disable,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
  await screen.findByText(translations.fr.writes.uncertain);
  expect(
    screen.queryByText(translations.fr.employeeLifecycle.statusSaved),
  ).toBeNull();
});
it("keeps the creation password after a lost reply and requires manual server review before another write", async () => {
  let writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        writes++;
        throw Error("lost response");
      }
      return new Response(
        JSON.stringify(url.endsWith("/roles") ? employee.roles : [employee]),
      );
    }),
  );
  renderPatient(
    <EmployeePage
      lang="fr"
      canManageAdmins
      onExpired={() => {}}
      onIdentityChanged={async () => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Ajouter un membre" }),
  );
  fireEvent.change(screen.getByLabelText("Nom"), {
    target: { value: "New employee" },
  });
  fireEvent.change(screen.getByLabelText("Nom d’utilisateur"), {
    target: { value: "newemployee" },
  });
  fireEvent.change(screen.getByLabelText("Mot de passe"), {
    target: { value: "private-test-password" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Dentiste" }));
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await screen.findByText(translations.fr.writes.uncertain);
  expect(
    (screen.getByLabelText("Mot de passe") as HTMLInputElement).value,
  ).toBe("private-test-password");
  expect(
    (screen.getByRole("button", { name: "Enregistrer" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: translations.fr.writes.review }),
  );
  await screen.findByText(/^Employee/);
  fireEvent.click(
    screen.getByRole("button", {
      name: translations.fr.writes.acknowledge,
    }),
  );
  expect(writes).toBe(1);
  expect(
    (screen.getByRole("button", { name: "Enregistrer" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Ignorer et quitter" }),
  );
  await screen.findByRole("button", { name: "Ajouter un membre" });
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(false);
});

it("confirms creation only after the reply and refreshes the employee table", async () => {
  let stored = false,
    finish!: (r: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST")
        return new Promise<Response>((resolve) => (finish = resolve));
      return new Response(
        JSON.stringify(
          url.endsWith("/roles") ? employee.roles : stored ? [employee] : [],
        ),
      );
    }),
  );
  renderPatient(
    <EmployeePage
      lang="fr"
      canManageAdmins
      onExpired={() => {}}
      onIdentityChanged={async () => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Ajouter un membre" }),
  );
  fireEvent.change(screen.getByLabelText("Nom"), {
    target: { value: employee.name },
  });
  fireEvent.change(screen.getByLabelText("Nom d’utilisateur"), {
    target: { value: employee.username },
  });
  fireEvent.change(screen.getByLabelText("Mot de passe"), {
    target: { value: "test-password" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Dentiste" }));
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  expect(screen.queryByText(translations.fr.employees.saved)).toBeNull();
  stored = true;
  finish(new Response(JSON.stringify(employee), { status: 201 }));
  await screen.findByText(translations.fr.employees.saved);
  await screen.findByRole("cell", { name: "Employee" });
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(false);
});

it.each([false, true])(
  "invalidates recovery after a denied list read including a late manual reply (%s)",
  async (late) => {
    let delay = late,
      denied = false,
      finish!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        if (options?.method === "POST") throw Error("lost");
        if (url.endsWith("/e"))
          return delay
            ? new Promise<Response>((resolve) => (finish = resolve))
            : new Response(JSON.stringify(employee));
        if (url.endsWith("/roles"))
          return new Response(JSON.stringify(employee.roles));
        return new Response(
          JSON.stringify(denied ? { error: "forbidden" } : [employee]),
          { status: denied ? 403 : 200 },
        );
      }),
    );
    renderPatient(
      <EmployeePage
        lang="fr"
        canManageAdmins
        onExpired={() => {}}
        onIdentityChanged={async () => {}}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: translations.fr.employeeLifecycle.reset,
      }),
    );
    fireEvent.change(
      screen.getByLabelText(translations.fr.employeeLifecycle.newPassword),
      { target: { value: "private-test-password" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
    await screen.findByText(translations.fr.writes.uncertain);
    fireEvent.click(
      screen.getByRole("button", { name: translations.fr.writes.review }),
    );
    if (late) await waitFor(() => expect(finish).toBeTypeOf("function"));
    else
      await screen.findByRole("button", {
        name: translations.fr.writes.acknowledge,
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
    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: translations.fr.writes.acknowledge,
        }),
      ).toBeNull(),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: translations.fr.writes.review,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
    if (late) {
      delay = false;
      finish(new Response(JSON.stringify(employee)));
    }
    denied = false;
    reconnect();
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: translations.fr.writes.review,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(
      (screen.getByRole("button", { name: "Confirmer" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByLabelText(
          translations.fr.employeeLifecycle.newPassword,
        ) as HTMLInputElement
      ).value,
    ).toBe("private-test-password");
  },
);
