import { Disclosure } from "../../client/ui/Disclosure";
import { App } from "../../client/app/App";
// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { UiProvider } from "../../client/ui/UiProvider";
import { CheckField } from "../../client/ui/CheckField";
import { SelectField } from "../../client/ui/SelectField";
import { Label } from "../../client/ui/Label";
import { PasswordVisibility } from "../../client/ui/PasswordVisibility";
import { AccountPassword } from "../../client/features/account/components/AccountPassword";
import { renderPatient } from "./render-patient";
import { RolePermissionsPage } from "../../client/features/roles/pages/RolePermissionsPage";
import { AppSidebar } from "../../client/app/layout/AppSidebar";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("labels a checkbox and supports Space, label activation, and disabled controls", async () => {
  function Example() {
    const [checked, setChecked] = useState(false);
    return (
      <>
        <CheckField checked={checked} onCheckedChange={setChecked}>
          Enfant
        </CheckField>
        <CheckField checked={false} onCheckedChange={() => {}} disabled>
          Disabled
        </CheckField>
      </>
    );
  }
  render(<Example />);
  const user = userEvent.setup();
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("checkbox", { name: "Enfant" }),
  );
  await user.keyboard("[Space]");
  expect(
    screen
      .getByRole("checkbox", { name: "Enfant" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  await user.click(screen.getByText("Enfant"));
  expect(
    screen
      .getByRole("checkbox", { name: "Enfant" })
      .getAttribute("aria-checked"),
  ).toBe("false");
  await user.click(screen.getByText("Disabled"));
  expect(
    screen
      .getByRole("checkbox", { name: "Disabled" })
      .getAttribute("aria-checked"),
  ).toBe("false");
});
it.each(["rtl", "ltr"] as const)(
  "select supports a labelled trigger, keyboard choice, Escape and focus return (%s)",
  async (direction) => {
    function Example() {
      const [value, setValue] = useState("");
      return (
        <>
          <Label htmlFor="gender" id="gender-label">
            Gender
          </Label>
          <SelectField
            id="gender"
            labelledBy="gender-label"
            direction={direction}
            value={value}
            onValueChange={setValue}
            placeholder="Choose"
            options={[
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
            ]}
          />
        </>
      );
    }
    render(<Example />);
    const user = userEvent.setup(),
      trigger = screen.getByRole("combobox", { name: "Gender" });
    await user.tab();
    expect(document.activeElement).toBe(trigger);
    await user.keyboard("{Enter}{End}{Enter}");
    expect(trigger.textContent).toContain("Female");
    expect(document.activeElement).toBe(trigger);
    await user.keyboard("{Enter}");
    expect(screen.getByRole("listbox")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  },
);
it("toggles password visibility with a named keyboard control", async () => {
  function Example() {
    const [shown, setShown] = useState(false);
    return (
      <UiProvider direction="ltr">
        <Label htmlFor="password">Password</Label>
        <input id="password" type={shown ? "text" : "password"} />
        <PasswordVisibility
          shown={shown}
          onShownChange={setShown}
          showLabel="Show password"
          hideLabel="Hide password"
        />
      </UiProvider>
    );
  }
  render(<Example />);
  const user = userEvent.setup();
  await user.tab();
  await user.tab();
  await user.keyboard("[Space]");
  expect(screen.getByLabelText("Password").getAttribute("type")).toBe("text");
  expect(
    screen
      .getByRole("button", { name: "Hide password" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});
it.each(["ar", "fr"] as const)(
  "navigates role choices with direction-aware arrow keys and activates with Space (%s)",
  async (lang) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          roles: [
            { id: "a", key: "dentist", editVersion: 1, permissions: ["patients.read"] },
            { id: "b", key: "receptionist", editVersion: 1, permissions: ["patients.write"] },
          ],
          permissions: ["patients.read", "patients.write"],
        }),
      }),
    );
    renderPatient(<RolePermissionsPage lang={lang} onExpired={() => {}} />);
    const radios = await screen.findAllByRole("radio"),
      user = userEvent.setup();
    radios[0].focus();
    await user.keyboard(lang === "ar" ? "{ArrowLeft}" : "{ArrowRight}");
    await user.keyboard("[Space]");
    expect(document.activeElement).toBe(radios[1]);
    expect(radios[1].getAttribute("aria-checked")).toBe("true");
  },
);
it("provides sidebar tooltips to keyboard focus and dismisses with Escape", async () => {
  const labels = {
    dashboard: "Cabinets",
    employees: "Employees",
    rolePermissions: "Roles",
    account: "Account",
    open: "Expand",
    close: "Collapse",
  };
  render(
    <UiProvider direction="ltr">
      <Disclosure>
        <AppSidebar
          collapsed
          page="employees"
          onNavigate={() => {}}
          kind="clinic"
          canManageEmployees
          isAdmin
          labels={labels}
        />
      </Disclosure>
    </UiProvider>,
  );
  const user = userEvent.setup();
  await user.tab();
  await user.tab();
  expect(await screen.findByRole("tooltip")).toBeTruthy();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Employees" }),
  );
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
});
it("exposes an expandable account password form without losing its labels", async () => {
  renderPatient(
    <AccountPassword lang="fr" onExpired={() => {}} onChanged={() => {}} />,
  );
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", {
    name: "Changer le mot de passe",
  });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  await user.tab();
  await user.keyboard("[Space]");
  expect(document.activeElement).toBe(
    screen.getByLabelText("Mot de passe actuel"),
  );
  await user.click(screen.getByRole("button", { name: "Annuler" }));
  expect(screen.queryByLabelText("Mot de passe actuel")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("shares mobile and sidebar disclosure controls and closes navigation after a mobile choice", async () => {
  localStorage.setItem("dentex-lang", "fr");
  window.matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          kind: "clinic",
          username: "qa",
          name: "QA",
          clinic: { name: "QA" },
          roles: ["admin"],
          permissions: [],
        }),
      }),
  );
  render(<App />);
  const user = userEvent.setup();
  const triggers = await screen.findAllByRole("button", {
    name: "Ouvrir le menu",
  });
  expect(triggers).toHaveLength(2);
  expect(triggers[0].getAttribute("aria-controls")).toBe(
    triggers[1].getAttribute("aria-controls"),
  );
  await user.click(triggers[1]);
  expect(
    triggers.every(
      (trigger) => trigger.getAttribute("aria-expanded") === "true",
    ),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Mon compte" }));
  expect(
    triggers.every(
      (trigger) => trigger.getAttribute("aria-expanded") === "false",
    ),
  ).toBe(true);
  cleanup();
  localStorage.clear();
});
