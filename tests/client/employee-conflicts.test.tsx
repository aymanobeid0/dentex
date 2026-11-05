// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
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
it.each([409, 500])('clears the unsaved warning when discarding a rejected or uncertain save (%s)', async status => {
  let writes=0;
  const employee={id:'e',name:'Original',username:'employee',active:true,editVersion:1,roles:[{id:'d',key:'dentist'}]};
  vi.stubGlobal('fetch',vi.fn(async(url:string, options?:RequestInit)=>{
    if(options?.method==='PUT'){writes++;return new Response(JSON.stringify({error:status===409?'edit_conflict':'server_error'}),{status});}
    return new Response(JSON.stringify(url.endsWith('/roles') ? employee.roles : [employee]));
  }));
  renderPatient(<EmployeePage lang="fr" canManageAdmins onExpired={()=>{}} onIdentityChanged={async()=>{}} />);
  fireEvent.click(await screen.findByRole('button',{name:'Modifier le membre'}));
  fireEvent.change(screen.getByLabelText('Nom'),{target:{value:'Draft'}});
  fireEvent.click(screen.getByRole('button',{name:'Enregistrer'}));
  await screen.findByText(status===409?/autre utilisateur/:/résultat.*incertain/i);
  fireEvent.click(screen.getByRole('button',{name:'Enregistrer'}));expect(writes).toBe(1);
  fireEvent.click(screen.getByRole('button',{name:'Annuler'}));
  fireEvent.click(await screen.findByRole('button',{name:'Ignorer et quitter'}));
  await screen.findByRole('button',{name:'Ajouter un membre'});
  const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);
});
it("keeps the employee draft and blocks a second write until explicit conflict review", async () => {
  let writes = 0;
  const employee = {
    id: "e",
    name: "Original",
    username: "employee",
    active: true,
    editVersion: 1,
    roles: [{ id: "d", key: "dentist" }],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "PUT") {
        writes++;
        expect(JSON.parse(options.body as string).editVersion).toBe(1);
        return new Response(JSON.stringify({ error: "edit_conflict" }), {
          status: 409,
        });
      }
      return new Response(
        JSON.stringify(
          url.endsWith("/roles")
            ? employee.roles
            : url.endsWith("/e")
              ? { ...employee, name: "Other manager", editVersion: 2 }
              : [employee],
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
    await screen.findByRole("button", { name: "Modifier le membre" }),
  );
  fireEvent.change(screen.getByLabelText("Nom"), {
    target: { value: "My draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  expect(await screen.findByText(/autre utilisateur/)).toBeTruthy();
  expect((screen.getByLabelText("Nom") as HTMLInputElement).value).toBe(
    "My draft",
  );
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  expect(writes).toBe(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Examiner la version actuelle" }),
  );
  expect(await screen.findByText("Other manager")).toBeTruthy();
  expect((screen.getByLabelText("Nom") as HTMLInputElement).value).toBe(
    "My draft",
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Différences examinées ; conserver mon brouillon",
    }),
  );
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
it("warns before discarding an Arabic draft and keeps offline data readable without sending writes", async () => {
  const fetch = vi.fn(
    async (url: string, _options?: RequestInit) =>
      new Response(
        JSON.stringify(
          url.endsWith("/roles")
            ? [{ id: "d", key: "dentist" }]
            : [
                {
                  id: "e",
                  name: "موظف",
                  username: "employee",
                  active: true,
                  editVersion: 1,
                  roles: [{ id: "d", key: "dentist" }],
                },
              ],
        ),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  renderPatient(
    <EmployeePage
      lang="ar"
      canManageAdmins
      onExpired={() => {}}
      onIdentityChanged={async () => {}}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "تعديل الموظف" }));
  fireEvent.change(screen.getByLabelText("الاسم"), {
    target: { value: "مسودة" },
  });
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "إلغاء" }));
  expect(await screen.findByRole("alertdialog")).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect((screen.getByLabelText("الاسم") as HTMLInputElement).value).toBe(
    "مسودة",
  );
  Object.defineProperty(navigator, "onLine", {
    value: false,
    configurable: true,
  });
  fireEvent(window, new Event("offline"));
  expect(await screen.findByText(/البيانات المحملة للقراءة فقط/)).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "حفظ" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(
    fetch.mock.calls.every(
      (call) => !call[1]?.method || call[1]?.method === "GET",
    ),
  ).toBe(true);
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
});
it.each([false, true])(
  "requires a new review after denied reads, including a late review response (%s)",
  async (late) => {
    const employee = {
      id: "e",
      name: "Original",
      username: "employee",
      active: true,
      editVersion: 1,
      roles: [{ id: "d", key: "dentist" }],
    };
    let denied = false,
      finish!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        if (options?.method === "PUT")
          return new Response(JSON.stringify({ error: "edit_conflict" }), {
            status: 409,
          });
        if (url.endsWith("/e"))
          return late
            ? new Promise<Response>((resolve) => (finish = resolve))
            : new Response(
                JSON.stringify({
                  ...employee,
                  name: "Review snapshot",
                  editVersion: 2,
                }),
              );
        if (denied)
          return new Response(JSON.stringify({ error: "forbidden" }), {
            status: 403,
          });
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
      await screen.findByRole("button", { name: "Modifier le membre" }),
    );
    fireEvent.change(screen.getByLabelText("Nom"), {
      target: { value: "My draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText(/autre utilisateur/);
    fireEvent.click(
      screen.getByRole("button", { name: "Examiner la version actuelle" }),
    );
    if (!late) await screen.findByText("Review snapshot");
    else await waitFor(() => expect(finish).toBeTypeOf("function"));
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
    await waitFor(() => expect(screen.queryByLabelText("Nom")).toBeNull());
    if (late)
      finish(
        new Response(
          JSON.stringify({
            ...employee,
            name: "Review snapshot",
            editVersion: 2,
          }),
        ),
      );
    denied = false;
    reconnect();
    await screen.findByLabelText("Nom");
    expect(screen.queryByText("Review snapshot")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Enregistrer" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  },
);
