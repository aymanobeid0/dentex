// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPatient } from "./render-patient";
import { PatientPage } from "../../client/features/patients";
import { PatientVisits } from "../../client/features/visits";
import { PatientAppointments } from "../../client/features/appointments";

const patient = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  fileNumber: "42",
  name: "Patient tabs",
  phone: "+22220123456",
  gender: "male",
  isChild: false,
  archived: false,
  birthDate: null,
  address: null,
  administrativeNote: null,
  editVersion: 1,
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const copy = {
  ar: {
    list: "أقسام ملف المريض",
    visits: "الزيارات",
    appointments: "المواعيد",
    odontogram: "المخطط السني",
    treatment: "خطة العلاج",
    unavailable: "هذا القسم غير متاح حاليًا.",
  },
  fr: {
    list: "Sections du dossier patient",
    visits: "Visites",
    appointments: "Rendez-vous",
    odontogram: "Schéma dentaire",
    treatment: "Plan de traitement",
    unavailable: "Cette section n’est pas disponible actuellement.",
  },
};
function transport() {
  const fetcher = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes("/visits/")
            ? { items: [], page: 1, hasNext: false }
            : url.includes("/appointments/")
              ? { items: [], total: 0, page: 1, hasNext: false }
              : patient,
        ),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
it.each(["ar", "fr"] as const)(
  "keeps patient identity above four separate sections and reads only the selected section in %s",
  async (lang) => {
    const fetcher = transport(),
      t = copy[lang],
      user = userEvent.setup();
    renderPatient(
      <PatientPage
        lang={lang}
        canRead
        canWrite
        view={{ kind: "file", patientId: patient.id }}
        onNavigate={vi.fn()}
        onExpired={vi.fn()}
        renderVisits={(context) => (
          <PatientVisits
            patient={context}
            lang={lang}
            canRead
            onExpired={vi.fn()}
          />
        )}
        renderAppointments={(context) => (
          <PatientAppointments
            patient={context}
            lang={lang}
            canRead
            canWrite
            onExpired={vi.fn()}
          />
        )}
      />,
    );
    const identity = await screen.findByText(patient.name);
    const tabs = screen.getByRole("tablist", { name: t.list });
    expect(
      identity.closest("article")!.compareDocumentPosition(tabs) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText(patient.phone)).toBeTruthy();
    expect(
      within(tabs)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual([t.visits, t.appointments, t.odontogram, t.treatment]);
    expect(
      screen.getByRole("tab", { name: t.visits }).getAttribute("aria-selected"),
    ).toBe("true");
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(([url]) => url.includes("/visits/patient/")),
      ).toBe(true),
    );
    expect(
      fetcher.mock.calls.some(([url]) => url.includes("/appointments/")),
    ).toBe(false);
    await user.click(screen.getByRole("tab", { name: t.appointments }));
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(([url]) => url.includes("/appointments/")),
      ).toBe(true),
    );
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByText(patient.phone)).toBeTruthy();
    await user.keyboard("{End}");
    expect(
      screen
        .getByRole("tab", { name: t.treatment })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText(t.unavailable)).toBeTruthy();
    await user.keyboard("{Home}");
    await user.keyboard(lang === "ar" ? "{ArrowLeft}" : "{ArrowRight}");
    expect(
      screen
        .getByRole("tab", { name: t.appointments })
        .getAttribute("aria-selected"),
    ).toBe("true");
  },
);
it("keeps the current section until the app permits leaving its draft", async () => {
  transport();
  let permit: (() => void) | undefined;
  let stay: (() => void) | undefined;
  const request = vi.fn((leave: () => void, cancel?: () => void) => {
    permit = leave;
    stay = cancel;
  });
  renderPatient(
    <PatientPage
      lang="fr"
      canRead
      canWrite
      view={{ kind: "file", patientId: patient.id }}
      onNavigate={vi.fn()}
      onExpired={vi.fn()}
      onSectionChangeRequest={request}
      renderVisits={() => <p>Current visit draft</p>}
      renderAppointments={() => <p>Appointment section</p>}
    />,
  );
  await screen.findByText(patient.name);
  await userEvent.click(
    screen.getByRole("tab", { name: copy.fr.appointments }),
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Current visit draft")).toBeTruthy();
  expect(screen.queryByText("Appointment section")).toBeNull();
  act(() => stay!());
  await userEvent.click(
    screen.getByRole("tab", { name: copy.fr.appointments }),
  );
  expect(request).toHaveBeenCalledTimes(2);
  expect(screen.getByText("Current visit draft")).toBeTruthy();
  act(() => permit!());
  expect(screen.getByText("Appointment section")).toBeTruthy();
});
