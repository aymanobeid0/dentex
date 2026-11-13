import userEvent from "@testing-library/user-event";
import { fireEvent, screen, within } from "@testing-library/react";
import { translations, type Lang } from "../../client/shared/i18n";
type User = ReturnType<typeof userEvent.setup>;
export async function chooseDate(
  user: User,
  label: string,
  value: string,
  lang: Lang,
) {
  await user.click(screen.getByLabelText(label));
  const t = translations[lang].dateTime,
    dialog = screen.getByRole("dialog", { name: label });
  fireEvent.change(within(dialog).getByLabelText(t.year), {
    target: { value: value.slice(0, 4) },
  });
  within(dialog).getByRole("combobox", { name: t.month }).focus();
  await user.keyboard("{Enter}");
  const month = new Intl.DateTimeFormat(
    lang === "ar" ? "ar-MR-u-nu-latn" : "fr-FR",
    { month: "long", calendar: "gregory", timeZone: "UTC" },
  ).format(new Date(value + "T12:00:00Z"));
  await user.click(screen.getByRole("option", { name: month }));
  const cell = dialog.querySelector<HTMLButtonElement>(
    `[data-date="${value}"]`,
  );
  if (!cell) throw Error("Date unavailable: " + value);
  await user.click(cell);
}
export async function chooseTime(
  user: User,
  label: string,
  value: string,
  lang: Lang,
) {
  await user.click(screen.getByLabelText(label));
  const t = translations[lang].dateTime,
    dialog = screen.getByRole("dialog", { name: label });
  within(dialog).getByRole("combobox", { name: t.hours }).focus();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("option", { name: value.slice(0, 2) }));
  within(dialog).getByRole("combobox", { name: t.minutes }).focus();
  await user.keyboard("{Enter}");
  await user.click(screen.getByRole("option", { name: value.slice(3) }));
  await user.click(within(dialog).getByRole("button", { name: t.applyTime }));
}
