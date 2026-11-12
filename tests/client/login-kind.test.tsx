// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { LoginPage } from "../../client/features/auth";
import { LanguageProvider } from "../../client/shared/i18n";
import { renderPatient } from "./render-patient";
import { useState } from "react";
import { UiProvider } from "../../client/ui/UiProvider";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
it("uses the supplied login kind and keeps non-secret fields when switching", async () => {
  localStorage.setItem("dentex-lang", "fr");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 401 })),
  );
  function Example() {
    const [kind, setKind] = useState<"clinic" | "platform">("platform");
    return (
      <LanguageProvider>
        <UiProvider direction="ltr">
          <LoginPage
            kind={kind}
            onKindChange={setKind}
            passwordChanged={false}
            onAuthenticated={() => {}}
            onLoggedIn={() => {}}
          />
        </UiProvider>
      </LanguageProvider>
    );
  }
  renderPatient(<Example />);
  expect(screen.queryByLabelText("Code du cabinet")).toBeNull();
  fireEvent.change(screen.getByLabelText("Nom d’utilisateur"), {
    target: { value: "operator" },
  });
  fireEvent.change(
    screen.getByLabelText(/Mot de passe/, { selector: "input" }),
    { target: { value: "secret" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: /cabinet/i }));
  expect(screen.getByLabelText("Code du cabinet")).toBeTruthy();
  expect(
    (screen.getByLabelText("Nom d’utilisateur") as HTMLInputElement).value,
  ).toBe("operator");
  expect(
    (
      screen.getByLabelText(/Mot de passe/, {
        selector: "input",
      }) as HTMLInputElement
    ).value,
  ).toBe("");
  expect(screen.getByRole("alert").textContent).toBe("");
});
