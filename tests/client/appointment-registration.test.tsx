import { chooseDate, chooseTime } from "./date-time-helpers";
// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPatient } from "./render-patient";
import { BookingAction } from "../../client/features/appointments";
import { PatientRegistrationPanel } from "../../client/features/patients";
import { translations } from "../../client/shared/i18n";
const patient = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  fileNumber: "27",
};
const doctor = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Doctor fixture",
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function transport(uncertain = false) {
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "POST" && url === "/api/clinic/patients") {
      if (uncertain) throw new TypeError("Response lost");
      return new Response(JSON.stringify(patient), { status: 201 });
    }
    if (options?.method === "POST")
      return new Response(JSON.stringify({ error: "appointment_overlap" }), {
        status: 409,
      });
    return new Response(
      JSON.stringify(
        url.endsWith("/doctors")
          ? { items: [doctor] }
          : { items: [], page: 1, hasNext: false },
      ),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function view(lang: "ar" | "fr", allowed = true) {
  return (
    <BookingAction
      lang={lang}
      canWrite
      canRegisterPatient={allowed}
      onExpired={vi.fn()}
      renderPatientRegistration={(callbacks) => (
        <PatientRegistrationPanel
          {...callbacks}
          lang={lang}
          canWrite={allowed}
          onExpired={vi.fn()}
        />
      )}
    />
  );
}
async function registerFields(lang: "ar" | "fr") {
  const t = translations[lang].patients,
    user = userEvent.setup();
  fireEvent.change(screen.getByRole("textbox", { name: new RegExp(t.name) }), {
    target: { value: "New appointment child" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: new RegExp(t.phone) }), {
    target: { value: "20123456" },
  });
  screen.getByRole("combobox").focus();
  await user.keyboard("{Enter}{Home}{Enter}");
  await user.click(screen.getByRole("checkbox", { name: t.child }));
  return user;
}
it.each(["ar", "fr"] as const)(
  "registers with existing patient rules and keeps the booking draft on failure in %s",
  async (lang) => {
    const fetcher = transport(),
      t = translations[lang].appointments,
      p = translations[lang].patients,
      user = userEvent.setup();
    renderPatient(view(lang));
    await user.click(screen.getByRole("button", { name: t.book }));
    await waitFor(() =>
      expect(
        screen
          .getByRole("combobox", { name: t.doctor })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    screen.getByRole("combobox", { name: t.doctor }).focus();
    await user.keyboard("{Enter}{Home}{Enter}");
    await chooseDate(user, t.date, "2090-01-01", lang);
    await chooseTime(user, t.time, "10:00", lang);
    fireEvent.change(screen.getByLabelText(t.note), {
      target: { value: "Keep booking draft" },
    });
    await user.type(
      screen.getByRole("combobox", { name: t.patientSearch }),
      "New appointment child",
    );
    await user.click(
      await screen.findByRole("button", { name: t.registerPatient }),
    );
    await registerFields(lang);
    expect(document.activeElement).not.toBe(document.body);
    await user.click(screen.getByRole("button", { name: p.register }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: p.register })).toBeNull(),
    );
    expect(
      screen.getByText(/New appointment child/).closest(".ui-selected-person")
        ?.textContent,
    ).toContain("27");
    expect((screen.getByLabelText(t.note) as HTMLTextAreaElement).value).toBe(
      "Keep booking draft",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: t.save }).hasAttribute("disabled"),
      ).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: t.save }));
    await screen.findByText(t.overlap);
    await user.click(screen.getByRole("button", { name: t.close }));
    const posts = fetcher.mock.calls.filter(
      ([, options]) => options?.method === "POST",
    );
    expect(posts).toHaveLength(2);
    const registration = JSON.parse(String(posts[0][1]?.body));
    expect(registration.isChild).toBe(true);
    expect(JSON.parse(String(posts[1][1]?.body)).patientId).toBe(patient.id);
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).includes("/api/clinic/patients/"),
      ),
    ).toBe(false);
    await user.click(screen.getByRole("button", { name: t.close }));
    await user.click(screen.getByRole("button", { name: t.discard }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      fetcher.mock.calls.filter(
        ([url, options]) =>
          options?.method === "POST" && url === "/api/clinic/patients",
      ),
    ).toHaveLength(1);
  },
);
it("preserves an uncertain registration and blocks duplicate writes", async () => {
  const fetcher = transport(true),
    t = translations.fr.appointments,
    p = translations.fr.patients,
    user = userEvent.setup();
  renderPatient(view("fr"));
  await user.click(screen.getByRole("button", { name: t.book }));
  await user.type(
    screen.getByRole("combobox", { name: t.patientSearch }),
    "New appointment child",
  );
  await user.click(
    await screen.findByRole("button", { name: t.registerPatient }),
  );
  await registerFields("fr");
  await user.click(screen.getByRole("button", { name: p.register }));
  await screen.findByText(p.uncertain);
  expect(
    (
      screen.getByRole("textbox", {
        name: new RegExp(p.name),
      }) as HTMLInputElement
    ).value,
  ).toBe("New appointment child");
  expect(
    screen.getByRole("button", { name: p.register }).hasAttribute("disabled"),
  ).toBe(true);
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
  ).toHaveLength(1);
});
it("requires patient registration permission independently and retains inputs after its revocation", async () => {
  transport();
  const t = translations.fr.appointments,
    p = translations.fr.patients,
    user = userEvent.setup();
  const { rerender } = renderPatient(view("fr", false));
  await user.click(screen.getByRole("button", { name: t.book }));
  await user.type(
    screen.getByRole("combobox", { name: t.patientSearch }),
    "Missing patient",
  );
  await screen.findByText(t.noPatients);
  expect(screen.queryByRole("button", { name: t.registerPatient })).toBeNull();
  rerender(view("fr", true));
  await user.click(screen.getByRole("button", { name: t.registerPatient }));
  fireEvent.change(screen.getByRole("textbox", { name: new RegExp(p.name) }), {
    target: { value: "Preserved inputs" },
  });
  rerender(view("fr", false));
  expect(
    (
      screen.getByRole("textbox", {
        name: new RegExp(p.name),
      }) as HTMLInputElement
    ).value,
  ).toBe("Preserved inputs");
  expect(
    screen.getByRole("button", { name: p.register }).hasAttribute("disabled"),
  ).toBe(true);
});
