// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderPatient } from "./render-patient";
import { PatientPage } from "./controlled-patient";
import { translations } from "../../client/shared/i18n";

const patient = {
  id: "patient-edit",
  fileNumber: "42",
  name: "Before edit",
  phone: "+22270112233",
  gender: "male",
  isChild: false,
  birthDate: null,
  address: null,
  administrativeNote: null,
  editVersion: 1,
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});
it("edits a file through the screen and waits for confirmation without duplicate writes", async () => {
  window.history.replaceState(null, "", "#patients/patient-edit");
  let current = { ...patient };
  let finish!: () => void;
  const writes: object[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(init.body as string);
        writes.push(body);
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        current = { ...current, ...body, editVersion: 2 };
        return new Response(
          JSON.stringify({ id: current.id, fileNumber: "42", editVersion: 2 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(current));
    }),
  );
  renderPatient(
    <PatientPage lang="fr" canRead canWrite onExpired={() => {}} />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Modifier les informations" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Nom complet" }), {
    target: { value: "After edit" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Enregistrer les modifications" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Enregistrer les modifications" }),
  );
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(screen.queryByRole("heading", { name: "After edit" })).toBeNull();
  finish();
  await screen.findByRole("heading", { name: "After edit" });
  expect(writes[0]).toMatchObject({ name: "After edit", editVersion: 1 });
  expect(writes[0]).not.toHaveProperty("fileNumber");
});
it("preserves a conflicting draft and requires a fresh file review before a deliberate retry", async () => {
  window.history.replaceState(null, "", "#patients/patient-edit");
  let current = { ...patient },
    writes = 0;
  const bodies: { editVersion: number }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        bodies.push(JSON.parse(init.body as string));
        writes++;
        if (writes === 1) {
          current = { ...current, name: "Other editor", editVersion: 2 };
          return new Response(JSON.stringify({ error: "edit_conflict" }), {
            status: 409,
          });
        }
        current = { ...current, ...bodies[1], editVersion: 3 };
        return new Response(
          JSON.stringify({ id: patient.id, fileNumber: "42", editVersion: 3 }),
        );
      }
      return new Response(JSON.stringify(current));
    }),
  );
  renderPatient(
    <PatientPage lang="fr" canRead canWrite onExpired={() => {}} />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Modifier les informations" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Nom complet" }), {
    target: { value: "My draft" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Enregistrer les modifications" }),
  );
  await screen.findByText(/Une autre personne/);
  expect(
    (screen.getByRole("textbox", { name: "Nom complet" }) as HTMLInputElement)
      .value,
  ).toBe("My draft");
  expect(
    (
      screen.getByRole("button", {
        name: "Enregistrer les modifications",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "Actualiser le dossier" }),
  );
  await screen.findByRole("heading", { name: "Other editor" });
  expect(writes).toBe(1);
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "J’ai vérifié le dossier et souhaite poursuivre",
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Enregistrer les modifications" }),
  );
  await waitFor(() => expect(writes).toBe(2));
  expect(bodies.map((body) => body.editVersion)).toEqual([1, 2]);
});
it.each(["ar", "fr"] as const)(
  "preserves uncertain edits and guards navigation in %s without resending on reconnect",
  async (lang) => {
    window.history.replaceState(null, "", "#patients/patient-edit");
    const t = translations[lang].patients;
    let writes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "PUT") {
          writes++;
          throw new TypeError("Connection lost");
        }
        return new Response(JSON.stringify(patient));
      }),
    );
    renderPatient(
      <PatientPage lang={lang} canRead canWrite onExpired={() => {}} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: t.edit }));
    const name = screen.getByRole("textbox", { name: t.name });
    fireEvent.change(name, { target: { value: "Keep my draft" } });
    fireEvent.click(screen.getByRole("button", { name: t.saveChanges }));
    await screen.findByText(t.editUncertain);
    expect((name as HTMLInputElement).value).toBe("Keep my draft");
    fireEvent(window, new Event("online"));
    fireEvent(window, new Event("focus"));
    expect(writes).toBe(1);
    expect(
      (screen.getByRole("button", { name: t.saveChanges }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: t.cancelEdit }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: t.stay }));
    expect((name as HTMLInputElement).value).toBe("Keep my draft");
    const unload = new Event("beforeunload", { cancelable: true });
    fireEvent(window, unload);
    expect(unload.defaultPrevented).toBe(true);
  },
);
it.each(["malformed", "numericReceipt", "server", "timeout", "duplicate", "expired"] as const)(
  "does not close an editor on %s responses",
  async (mode) => {
    window.history.replaceState(null, "", "#patients/patient-edit");
    const expired = vi.fn();
    let writes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "PUT") {
          writes++;
          const status = {
            malformed: 200,
            numericReceipt: 200,
            server: 500,
            timeout: 408,
            duplicate: 409,
            expired: 401,
          }[mode];
          return new Response(
            JSON.stringify(mode === 'numericReceipt' ? { id: patient.id, fileNumber: 42, editVersion: 2 } : {
              error: mode === "duplicate" ? "duplicate_phone" : "server_error",
            }),
            { status },
          );
        }
        return new Response(JSON.stringify(patient));
      }),
    );
    renderPatient(
      <PatientPage lang="fr" canRead canWrite onExpired={expired} />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Modifier les informations" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Nom complet" }), {
      target: { value: "Draft" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Enregistrer les modifications" }),
    );
    if (mode === "expired")
      await waitFor(() => expect(expired).toHaveBeenCalled());
    else if (mode === "duplicate")
      await waitFor(() =>
        expect(document.activeElement?.id).toBe("patient-phone"),
      );
    else await screen.findByText(translations.fr.patients.editUncertain);
    expect(
      (screen.getByRole("textbox", { name: "Nom complet" }) as HTMLInputElement)
        .value,
    ).toBe("Draft");
    expect(writes).toBe(1);
  },
);
it("hides editing from read-only users", async () => {
  window.history.replaceState(null, "", "#patients/patient-edit");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(patient))),
  );
  renderPatient(
    <PatientPage lang="fr" canRead canWrite={false} onExpired={() => {}} />,
  );
  await screen.findByRole("heading", { name: "Before edit" });
  expect(
    screen.queryByRole("button", { name: "Modifier les informations" }),
  ).toBeNull();
});
