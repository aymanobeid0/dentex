import { chooseDate, chooseTime } from "./date-time-helpers";
// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPatient } from "./render-patient";
import {
  AppointmentsPage,
  PatientAppointments,
} from "../../client/features/appointments";
import { translations } from "../../client/shared/i18n";
const patient = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Patient fixture",
  fileNumber: "17",
  archived: false,
};
const doctor = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Doctor fixture",
  eligible: true,
};
const row = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  patient,
  doctor,
  startsAt: "2090-01-01T10:00:00.000Z",
  endsAt: "2090-01-01T10:30:00.000Z",
  status: "booked",
  editVersion: 1,
};
const result = { items: [row], page: 1, total: 1, hasNext: false };
const detail = {
  ...row,
  patient: { ...patient, phone: "+22262112233" },
  administrativeNote: "Administrative fixture",
  createdAt: row.startsAt,
  createdBy: doctor,
  changes: [
    {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      actor: doctor,
      action: "created",
      createdAt: row.startsAt,
      before: null,
      after: {
        ...row,
        patientId: patient.id,
        doctorId: doctor.id,
        administrativeNote: "Administrative fixture",
      },
    },
  ],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function transport() {
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith("/doctors"))
      return new Response(JSON.stringify({ items: [doctor] }));
    if (url.includes("/appointments/patients?"))
      return new Response(
        JSON.stringify({
          items: [{ ...patient, phone: "+22262112233" }],
          page: 1,
          hasNext: false,
        }),
      );
    if (url.endsWith(row.id)) return new Response(JSON.stringify(detail));
    if (options?.method === "POST") {
      const body = JSON.parse(String(options.body));
      return new Response(
        JSON.stringify({
          ...row,
          patientId: body.patientId,
          doctorId: body.doctorId,
          startsAt: `${body.date}T${body.time}:00.000Z`,
          endsAt: `${body.date}T10:30:00.000Z`,
          status: "booked",
        }),
        { status: 201 },
      );
    }
    return new Response(JSON.stringify(result));
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
it.each(["ar", "fr"] as const)(
  "reads the daily table, filters and creation detail in %s",
  async (lang) => {
    const fetcher = transport(),
      t = translations[lang].appointments,
      user = userEvent.setup();
    const { container } = renderPatient(
      <AppointmentsPage
        lang={lang}
        canRead
        canWrite={false}
        onExpired={vi.fn()}
      />,
    );
    await screen.findByRole("button", {
      name: `${t.details}: ${patient.name} 10:00`,
    });
    expect(screen.queryByText("+22262112233")).toBeNull();
    expect(container.querySelector("section")?.dir).toBe(
      lang === "ar" ? "rtl" : "ltr",
    );
    await user.click(screen.getByRole("button", { name: t.filters }));
    fireEvent.change(screen.getByLabelText(t.patientSearch), {
      target: { value: "Target search" },
    });
    await user.click(screen.getByRole("button", { name: t.search }));
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(([url]) =>
          String(url).includes("q=Target+search"),
        ),
      ).toBe(true),
    );
    await user.click(
      await screen.findByRole("button", {
        name: `${t.details}: ${patient.name} 10:00`,
      }),
    );
    await screen.findAllByText("Administrative fixture");
    expect(await screen.findByText("+22262112233")).toBeTruthy();
    expect(screen.getByRole("heading", { name: t.history })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: t.close }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("aria-label")).toBe(
        `${t.details}: ${patient.name} 10:00`,
      ),
    );
  },
);
it("creates from a limited patient search with write alone without requesting a schedule", async () => {
  const fetcher = transport(),
    t = translations.fr.appointments,
    user = userEvent.setup();
  renderPatient(
    <AppointmentsPage lang="fr" canRead={false} canWrite onExpired={vi.fn()} />,
  );
  expect(screen.getByText(t.createOnly)).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: t.book }));
  expect(screen.queryByRole("listbox")).toBeNull();
  await user.type(
    screen.getByRole("combobox", { name: t.patientSearch }),
    "Patient",
  );
  await user.click(
    await screen.findByRole("option", { name: /Patient fixture.*17/ }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: t.doctor }).hasAttribute("disabled"),
    ).toBe(false),
  );
  screen.getByRole("combobox", { name: t.doctor }).focus();
  await user.keyboard("{Enter}{Home}{Enter}");
  await chooseDate(user, t.date, "2090-01-01", "fr");
  await chooseTime(user, t.time, "10:00", "fr");
  await user.click(screen.getByRole("button", { name: t.save }));
  await screen.findByText(t.saved);
  const writes = fetcher.mock.calls.filter(
    ([, opts]) => opts?.method === "POST",
  );
  expect(writes).toHaveLength(1);
  expect(JSON.parse(String(writes[0][1]?.body)).patientId).toBe(patient.id);
  expect(
    fetcher.mock.calls.every(
      ([url, opts]) =>
        opts?.method === "POST" ||
        String(url).includes("/patients?") ||
        String(url).endsWith("/doctors"),
    ),
  ).toBe(true);
});
it("removes patient section data immediately when its read permission is withdrawn", async () => {
  transport();
  const { rerender } = renderPatient(
    <PatientAppointments
      patient={patient}
      lang="fr"
      canRead
      canWrite={false}
      onExpired={vi.fn()}
    />,
  );
  await screen.findByText(patient.name);
  rerender(
    <PatientAppointments
      patient={patient}
      lang="fr"
      canRead={false}
      canWrite={false}
      onExpired={vi.fn()}
    />,
  );
  expect(screen.queryByText(patient.name)).toBeNull();
});
it("displays a denied read separately from an empty list", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
    ),
  );
  renderPatient(
    <AppointmentsPage lang="fr" canRead canWrite={false} onExpired={vi.fn()} />,
  );
  await screen.findByRole("alert");
  expect(
    screen.queryByText(translations.fr.appointments.noAppointments),
  ).toBeNull();
});
