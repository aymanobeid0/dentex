// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPatient } from "./render-patient";
import { PatientTreatmentPlans } from "../../client/features/visits/PatientTreatmentPlans";
import { TreatmentEditor } from "../../client/features/visits/TreatmentEditor";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each(["ar", "fr"] as const)(
  "creates a plan through a confirmed HTTP response in %s",
  async (lang) => {
    const ar = lang === "ar";
    let plans: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method === "POST") {
          const body = JSON.parse(options.body as string);
          const row = {
            ...body,
            patientId: "p",
            status: "active",
            editVersion: 1,
            createdAt: new Date().toISOString(),
            items: [],
            history: [],
          };
          plans = [row];
          return new Response(JSON.stringify(row), { status: 201 });
        }
        return new Response(JSON.stringify({ items: plans }));
      }),
    );
    renderPatient(
      <PatientTreatmentPlans
        patient={{ id: "p", name: "Patient", fileNumber: "1", archived: false }}
        lang={lang}
        canTreat
        onExpired={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: ar ? "خطة جديدة" : "Nouveau plan",
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: ar ? "اسم الخطة" : "Nom du plan" }),
      "Restoration",
    );
    await user.click(
      screen.getByRole("button", { name: ar ? "حفظ" : "Enregistrer" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Restoration" }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);
it("retains an uncertain draft and requires a successful server review before closing it", async () => {
  let failReview = true,
    posts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        posts++;
        throw new TypeError("lost reply");
      }
      return new Response(
        JSON.stringify(failReview ? { error: "server_error" } : { items: [] }),
        { status: failReview ? 500 : 200 },
      );
    }),
  );
  const close = vi.fn(),
    user = userEvent.setup();
  renderPatient(
    <TreatmentEditor
      choice={{ kind: "plan" }}
      patientId="p"
      lang="fr"
      onClose={close}
      onExpired={() => {}}
    />,
  );
  await user.type(
    screen.getByRole("textbox", { name: "Nom du plan" }),
    "Draft",
  );
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));
  expect(
    await screen.findByText(/Résultat de l’enregistrement incertain/),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Fermer" }));
  expect(close).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Vérifier les données du serveur" }),
  );
  expect(
    await screen.findByText("Impossible de charger les données."),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Fermer" }));
  expect(close).not.toHaveBeenCalled();
  failReview = false;
  await user.click(
    screen.getByRole("button", { name: "Vérifier les données du serveur" }),
  );
  await screen.findByRole("region", {
    name: "Vérifier les données du serveur",
  });
  await user.click(screen.getByRole("button", { name: "Fermer" }));
  await user.click(
    screen.getByRole("button", { name: "Abandonner et quitter" }),
  );
  expect(close).toHaveBeenCalledOnce();
  expect(posts).toBe(1);
});
