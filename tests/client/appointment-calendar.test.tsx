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
      name: new RegExp(t.more),
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
    expect(week.querySelectorAll(".ui-week-hour")).toHaveLength(24);
    expect(
      within(week).getAllByRole("button", { name: /Calendar patient/ }),
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
