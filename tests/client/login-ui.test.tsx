import "./ui-browser-apis";
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "../../client/app/App";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it.each([
  [403, "Origine de la demande non autorisée."],
  [500, "Une erreur du serveur est survenue."],
])(
  "shows the real class of login failure %s in both languages",
  async (status, frText) => {
    localStorage.setItem("dentex-lang", "fr");
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
    window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList);
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve({
          ok: false,
          status: url === "/api/auth/me" ? 401 : status,
        }),
      ),
    );
    render(<App />);
    fireEvent.change(await screen.findByLabelText("Code du cabinet"), {
      target: { value: "0001" },
    });
    fireEvent.change(screen.getByLabelText("Nom d’utilisateur"), {
      target: { value: "test" },
    });
    fireEvent.change(
      screen.getByLabelText(/Mot de passe/, { selector: "input" }),
      { target: { value: "test-password" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findByText(new RegExp(frText))).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "التغيير إلى اللغة العربية" }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      status === 403 ? "مصدر الطلب" : "خطأ في الخادم",
    );
  },
);
