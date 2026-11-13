// @vitest-environment jsdom
import "./ui-browser-apis";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateField, TimeField } from "../../client/ui/DateTimeField";
import { translations, type Lang } from "../../client/shared/i18n";
import { renderPatient } from "./render-patient";
import { chooseDate, chooseTime } from "./date-time-helpers";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function Fields({ lang }: { lang: Lang }) {
  const [date, setDate] = useState("2028-02-28"),
    [time, setTime] = useState("10:07");
  return (
    <>
      <DateField
        id="date"
        label="Date"
        lang={lang}
        value={date}
        onValueChange={setDate}
      />
      <TimeField
        id="time"
        label="Time"
        lang={lang}
        value={time}
        onValueChange={setTime}
      />
    </>
  );
}
it.each(["ar", "fr"] as const)(
  "selects leap dates and all-minute times through custom controls in %s",
  async (lang) => {
    const user = userEvent.setup();
    renderPatient(<Fields lang={lang} />);
    await chooseDate(user, "Date", "2028-02-29", lang);
    expect((screen.getByLabelText("Date") as HTMLButtonElement).value).toBe(
      "2028-02-29",
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Date"));
    await chooseTime(user, "Time", "23:59", lang);
    expect((screen.getByLabelText("Time") as HTMLButtonElement).value).toBe(
      "23:59",
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Time"));
    await user.click(screen.getByLabelText("Time"));
    screen
      .getByRole("combobox", { name: translations[lang].dateTime.hours })
      .focus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("option", { name: "04" }));
    await user.click(
      screen.getByRole("button", {
        name: translations[lang].dateTime.cancel,
      }),
    );
    expect((screen.getByLabelText("Time") as HTMLButtonElement).value).toBe(
      "23:59",
    );
  },
);
it.each(["ar", "fr"] as const)(
  "moves across month boundaries by keyboard and restores focus on dismissal in %s",
  async (lang) => {
    const user = userEvent.setup();
    renderPatient(<Fields lang={lang} />);
    await user.click(screen.getByLabelText("Date"));
    const cell = screen
      .getByRole("grid")
      .querySelector<HTMLButtonElement>('[data-date="2028-02-28"]')!;
    cell.focus();
    await user.keyboard(
      lang === "ar" ? "{ArrowLeft}{ArrowLeft}" : "{ArrowRight}{ArrowRight}",
    );
    expect(document.activeElement?.getAttribute("data-date")).toBe(
      "2028-03-01",
    );
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((screen.getByLabelText("Date") as HTMLButtonElement).value).toBe(
      "2028-02-28",
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Date"));
  },
);
it("keeps Gregorian year limits and leap rules without emitting an invalid date", async () => {
  const user = userEvent.setup();
  renderPatient(<Fields lang="fr" />);
  await user.click(screen.getByLabelText("Date"));
  const t = translations.fr.dateTime;
  fireEvent.change(screen.getByLabelText(t.year), {
    target: { value: "2100" },
  });
  expect(
    screen.getByRole("grid").querySelector('[data-date="2100-02-29"]'),
  ).toBeNull();
  fireEvent.change(screen.getByLabelText(t.year), { target: { value: "" } });
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(
    screen
      .queryAllByRole("gridcell")
      .every((cell) => cell.getAttribute("aria-disabled") === "true"),
  ).toBe(true);
  fireEvent.change(screen.getByLabelText(t.year), { target: { value: "1" } });
  screen.getByRole("combobox", { name: t.month }).focus();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("option", { name: "janvier" }));
  expect(
    screen
      .getByRole("button", { name: t.previousMonth })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.change(screen.getByLabelText(t.year), {
    target: { value: "9999" },
  });
  screen.getByRole("combobox", { name: t.month }).focus();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("option", { name: "décembre" }));
  expect(
    screen.getByRole("button", { name: t.nextMonth }).hasAttribute("disabled"),
  ).toBe(true);
});
