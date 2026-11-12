// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { PatientPage, type PatientView } from "../../client/features/patients";
import { renderPatient } from "./render-patient";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
it("displays the requested patient independently of the URL and returns to a fresh list", async () => {
  window.history.replaceState(null, "", "#patients/unrelated");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("/selected")
              ? {
                  id: "selected",
                  name: "Selected patient",
                  fileNumber: "42",
                  phone: "+22246108834",
                  gender: "female",
                  archived: false,
                  editVersion: 1,
                  isChild: false,
                  birthDate: null,
                  address: null,
                  administrativeNote: null,
                }
              : { items: [], page: 1, hasNext: false },
          ),
        ),
    ),
  );
  function Example() {
    const [view, setView] = useState<PatientView>({
      kind: "file",
      patientId: "selected",
    });
    return (
      <PatientPage
        lang="fr"
        canRead
        canWrite={false}
        view={view}
        onNavigate={setView}
        onExpired={() => {}}
      />
    );
  }
  renderPatient(<Example />);
  await screen.findByRole("heading", { name: "Selected patient" });
  fireEvent.click(screen.getByRole("button", { name: "Retour à la liste" }));
  expect(await screen.findByRole("searchbox")).toBeTruthy();
  expect(window.location.hash).toBe("#patients/unrelated");
});
