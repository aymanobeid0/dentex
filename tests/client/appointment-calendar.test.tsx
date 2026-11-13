import { chooseDate, chooseTime } from "./date-time-helpers";
// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPatient } from "./render-patient";
import { AppointmentsPage } from "../../client/features/appointments";
import {
  calendarDays,
  periodStart,
  shiftPeriod,
} from "../../client/features/appointments/calendar";
import { translations } from "../../client/shared/i18n";
import { AppointmentCalendar } from "../../client/features/appointments/AppointmentCalendar";
const doctor = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Calendar doctor",
  eligible: true,
};
const rows = ["A", "B", "C"].map((name, index) => ({
  id: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${index}`,
  patient: {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`,
    name: `Calendar patient ${name}`,
    fileNumber: String(index + 1),
    archived: index === 2,
  },
  doctor: { ...doctor, eligible: index !== 2 },
  startsAt: "2090-01-01T10:07:00.000Z",
  endsAt: "2090-01-01T10:37:00.000Z",
  status: index === 2 ? "cancelled" : "booked",
  editVersion: 1,
}));
const json = (body: unknown) => new Response(JSON.stringify(body));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function transport() {
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith("/doctors")) return json({ items: [doctor] });
    const selected = rows.find((row) => url.endsWith(row.id));
    if (selected)
      return json({
        ...selected,
        patient: { ...selected.patient, phone: "+22262112233" },
        administrativeNote: null,
        createdAt: selected.startsAt,
        createdBy: doctor,
        changes: [],
      });
    return json({ items: rows, total: rows.length, page: 1, hasNext: false });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
it.each(["ar", "fr"] as const)(
  "shows month and week calendars, expanded days and shared detail actions in %s",
  async (lang) => {
    const fetcher = transport(),
      t = translations[lang].appointments,
      user = userEvent.setup();
    renderPatient(
      <AppointmentsPage lang={lang} canRead canWrite onExpired={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: t.filters }));
    await chooseDate(user, t.date, "2090-01-01", lang);
    await user.click(screen.getByRole("radio", { name: t.month }));
    const month = await screen.findByRole("region", { name: t.monthCalendar });
    expect(within(month).getAllByRole("columnheader")[0].textContent).toBe(
      lang === "ar" ? "الاثنين" : "lundi",
    );
    expect(
      within(month).queryByRole("button", { name: /Calendar patient C/ }),
    ).toBeNull();
    const more = within(month).getByRole("button", {
      name: new RegExp("^" + t.total + ": 3"),
    });
    more.focus();
    await user.keyboard("{Enter}");
    const agenda = screen.getByRole("region", { name: t.dayAppointments });
    const cancelled = within(agenda).getByRole("button", {
      name: /Calendar patient C/,
    });
    expect(cancelled.getAttribute("data-cancelled")).toBe("true");
    expect(cancelled.textContent).toContain(t.cancelled);
    expect(cancelled.textContent).toContain(t.archivedWarning);
    expect(cancelled.textContent).toContain(t.doctorWarning);
    await user.click(
      within(agenda).getByRole("button", { name: /Calendar patient A/ }),
    );
    await screen.findByRole("button", { name: t.changeStatus });
    await screen.findByRole("button", { name: t.reschedule });
    await user.click(screen.getByRole("button", { name: t.close }));
    await user.click(screen.getByRole("button", { name: t.close }));
    await user.click(screen.getByRole("radio", { name: t.week }));
    const week = await screen.findByRole("region", { name: t.weekCalendar });
    expect(week.querySelectorAll(".ui-week-hour")).toHaveLength(0);
    expect(within(week).queryByText("Calendar patient A")).toBeNull();
    await user.click(
      within(week).getByRole("button", {
        name: new RegExp("^" + t.total + ": 3"),
      }),
    );
    expect(
      within(
        screen.getByRole("dialog", { name: t.dayAppointments }),
      ).getAllByRole("button", { name: /Calendar patient/ }),
    ).toHaveLength(3);
    expect(fetcher.mock.calls.some(([url]) => url.includes("view=month"))).toBe(
      true,
    );
    expect(fetcher.mock.calls.some(([url]) => url.includes("view=week"))).toBe(
      true,
    );
  },
);
it("keeps a late response for a previous period out of the current calendar", async () => {
  const t = translations.fr.appointments,
    user = userEvent.setup();
  let resolveWeek: (response: Response) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/doctors")) return json({ items: [doctor] });
      if (url.includes("view=week"))
        return new Promise<Response>((resolve) => {
          resolveWeek = resolve;
        });
      return json({ items: [rows[0]], total: 1, page: 1, hasNext: false });
    }),
  );
  renderPatient(
    <AppointmentsPage lang="fr" canRead canWrite={false} onExpired={vi.fn()} />,
  );
  await user.click(screen.getByRole("button", { name: t.filters }));
  await chooseDate(user, t.date, "2090-01-01", "fr");
  await user.click(screen.getByRole("radio", { name: t.week }));
  await user.click(screen.getByRole("radio", { name: t.month }));
  await screen.findByRole("region", { name: t.monthCalendar });
  await act(async () =>
    resolveWeek(
      json({
        items: [
          {
            ...rows[0],
            patient: { ...rows[0].patient, name: "Stale week patient" },
          },
        ],
        total: 1,
        page: 1,
        hasNext: false,
      }),
    ),
  );
  expect(screen.queryByText("Stale week patient")).toBeNull();
  expect(screen.queryByRole("region", { name: t.weekCalendar })).toBeNull();
});
it("rejects a partial calendar response rather than presenting it as complete", async () => {
  const t = translations.fr.appointments,
    user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("/doctors")
        ? json({ items: [doctor] })
        : json({ items: [rows[0]], total: 57, page: 1, hasNext: true }),
    ),
  );
  renderPatient(
    <AppointmentsPage lang="fr" canRead canWrite={false} onExpired={vi.fn()} />,
  );
  await user.click(screen.getByRole("radio", { name: t.month }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("region", { name: t.monthCalendar })).toBeNull();
});
it("preserves Gregorian Monday boundaries, leap days and navigation at supported year edges", () => {
  expect(periodStart("2027-01-01", "week").toISOString()).toBe(
    "2026-12-28T00:00:00.000Z",
  );
  expect(calendarDays("2027-01-01", "week")).toEqual([
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
  ]);
  expect(calendarDays("2088-02-15", "month")).toContain("2088-02-29");
  expect(calendarDays("2100-02-15", "month")).not.toContain("2100-02-29");
  expect(shiftPeriod("2088-01-31", "month", 1)).toBe("2088-02-01");
  expect(shiftPeriod("0001-01-01", "day", -1)).toBeNull();
  expect(shiftPeriod("9999-12-31", "month", 1)).toBeNull();
  for (const day of calendarDays("9999-12-31", "month"))
    expect(Number.isFinite(new Date(day + "T00:00:00.000Z").getTime())).toBe(
      true,
    );
});

it.each(["ar", "fr"] as const)(
  "opens the full day list from the summary card, including paged results in %s",
  async (lang) => {
    const t = translations[lang].appointments,
      user = userEvent.setup(),
      onPage = vi.fn(),
      onOpen = vi.fn();
    const appointments = Array.from({ length: 7 }, (_, index) => ({
      ...rows[0],
      status: "booked" as const,
      id: "day-" + index,
      patient: { ...rows[0].patient, name: "Day patient " + index },
    }));
    renderPatient(
      <AppointmentCalendar
        date="2090-01-01"
        view="day"
        items={appointments}
        lang={lang}
        onOpen={onOpen}
        dayPage={{ page: 1, total: 55, hasNext: true, onChange: onPage }}
      />,
    );
    const card = screen.getByRole("button", { name: t.viewDayAppointments });
    expect(card.querySelectorAll(".ui-day-agenda-entry")).toHaveLength(4);
    expect(card.textContent).toContain("+51");
    card.focus();
    await user.keyboard("{Enter}");
    const list = screen.getByRole("dialog", { name: t.dayAppointments });
    expect(
      within(list).getAllByRole("button", { name: /Day patient/ }),
    ).toHaveLength(7);
    await user.click(within(list).getByRole("button", { name: t.next }));
    expect(onPage).toHaveBeenCalledWith(2);
    await user.click(
      within(list).getByRole("button", { name: /Day patient 6/ }),
    );
    expect(onOpen).toHaveBeenCalledWith("day-6");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(card));
  },
);

it.each(["ar", "fr"] as const)(
  "books from a day hour with an editable initial time and a clean next booking in %s",
  async (lang) => {
    const t = translations[lang].appointments,
      user = userEvent.setup();
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        const input = JSON.parse(String(options.body));
        const startsAt = input.date + "T" + input.time + ":00.000Z";
        return new Response(
          JSON.stringify({
            id: rows[0].id,
            patientId: input.patientId,
            doctorId: input.doctorId,
            startsAt,
            endsAt: new Date(
              Date.parse(startsAt) + input.durationMinutes * 60000,
            ).toISOString(),
            status: "booked",
            editVersion: 1,
          }),
          { status: 201 },
        );
      }
      if (url.endsWith("/doctors")) return json({ items: [doctor] });
      if (url.includes("/patients?"))
        return json({
          items: [{ ...rows[0].patient, phone: "+22262112233" }],
          page: 1,
          hasNext: false,
        });
      return json({ items: rows, total: 3, page: 1, hasNext: false });
    });
    vi.stubGlobal("fetch", fetcher);
    renderPatient(
      <AppointmentsPage lang={lang} canRead canWrite onExpired={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: t.filters }));
    await chooseDate(user, t.date, "2090-01-01", lang);
    const hour = await screen.findByRole("button", {
      name: t.bookAt + " 14:00",
    });
    await user.click(hour);
    let dialog = screen.getByRole("dialog", { name: t.title });
    expect(within(dialog).getByLabelText(t.date).getAttribute("value")).toBe(
      "2090-01-01",
    );
    expect(within(dialog).getByLabelText(t.time).getAttribute("value")).toBe(
      "14:00",
    );
    await user.click(within(dialog).getByRole("button", { name: t.close }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(hour));
    hour.focus();
    await user.keyboard("{Enter}");
    dialog = screen.getByRole("dialog", { name: t.title });
    await user.type(
      within(dialog).getByRole("combobox", { name: t.patientSearch }),
      "Calendar",
    );
    await user.click(await screen.findByRole("option"));
    await waitFor(() =>
      expect(
        within(dialog)
          .getByRole("combobox", { name: t.doctor })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    within(dialog).getByRole("combobox", { name: t.doctor }).focus();
    await user.keyboard("{Enter}{Home}{Enter}");
    await chooseTime(user, t.time, "14:07", lang);
    await user.click(within(dialog).getByRole("button", { name: t.save }));
    const result = await screen.findByRole("dialog", { name: t.resultSuccess });
    expect(result.textContent).toContain("14:07 – 14:37");
    await user.click(within(result).getByRole("button", { name: t.close }));
    await waitFor(() => expect(document.activeElement).toBe(hour));
    const writes = fetcher.mock.calls.filter(
      ([, options]) => options?.method === "POST",
    );
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({
      date: "2090-01-01",
      time: "14:07",
    });
    await user.click(screen.getByRole("button", { name: t.book }));
    dialog = screen.getByRole("dialog", { name: t.title });
    expect(within(dialog).getByLabelText(t.time).getAttribute("value")).toBe(
      "",
    );
  },
);
it("keeps day hour booking disabled for a read-only employee", async () => {
  transport();
  const t = translations.fr.appointments,
    user = userEvent.setup();
  renderPatient(
    <AppointmentsPage lang="fr" canRead canWrite={false} onExpired={vi.fn()} />,
  );
  const hour = await screen.findByRole("button", {
    name: t.bookAt + " 14:00",
  });
  expect(hour.hasAttribute("disabled")).toBe(true);
  await user.click(hour);
  expect(screen.queryByRole("dialog")).toBeNull();
});
