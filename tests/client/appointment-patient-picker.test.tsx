// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookingAction } from "../../client/features/appointments";
import { PatientPicker } from "../../client/features/appointments/PatientPicker";
import { translations } from "../../client/shared/i18n";
import { renderPatient } from "./render-patient";
const patients = ["Marie Alpha", "Marie Beta"].map((name, index) => ({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`,
  name,
  fileNumber: String(index + 1),
  phone: "+22262112233",
  archived: false,
}));
const json = (items: typeof patients) =>
  new Response(JSON.stringify({ items, page: 1, hasNext: false }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it.each(["ar", "fr"] as const)(
  "only searches typed names, supports keyboard selection and offers registration only for no match in %s",
  async (lang) => {
    const fetcher = vi.fn(async (url: string) =>
      json(
        new URL(url, "http://localhost").searchParams.get("q") === "Marie"
          ? patients
          : [],
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const selected = vi.fn(),
      register = vi.fn(),
      t = translations[lang].appointments,
      user = userEvent.setup();
    renderPatient(
      <PatientPicker
        lang={lang}
        canWrite
        disabled={false}
        onSelect={selected}
        onExpired={vi.fn()}
        onRegister={register}
      />,
    );
    const input = screen.getByRole("combobox", { name: t.patientSearch });
    await user.click(input);
    await user.type(input, "  ");
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(
      screen.queryByRole("button", { name: t.registerPatient }),
    ).toBeNull();
    await user.clear(input);
    await user.type(input, "Marie");
    await screen.findByRole("option", { name: /Marie Alpha/ });
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: t.registerPatient }),
    ).toBeNull();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(selected).toHaveBeenCalledWith(patients[0]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect((input as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(input);
    await user.type(input, "Missing");
    await screen.findByText(t.noPatients);
    await user.click(screen.getByRole("button", { name: t.registerPatient }));
    expect(register).toHaveBeenCalledTimes(1);
    expect(
      fetcher.mock.calls.every(([url]) =>
        new URL(url, "http://localhost").searchParams.get("q")?.trim(),
      ),
    ).toBe(true);
  },
);
it("hides old matches immediately when the name changes or is cleared and ignores late responses", async () => {
  let resolveFirst: (response: Response) => void = () => {};
  const fetcher = vi.fn(async (url: string) =>
    new URL(url, "http://localhost").searchParams.get("q") === "Alpha"
      ? new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        })
      : json([patients[1]]),
  );
  vi.stubGlobal("fetch", fetcher);
  const t = translations.fr.appointments;
  renderPatient(
    <PatientPicker
      lang="fr"
      canWrite
      disabled={false}
      onSelect={vi.fn()}
      onExpired={vi.fn()}
    />,
  );
  const input = screen.getByRole("combobox", { name: t.patientSearch });
  fireEvent.change(input, { target: { value: "Alpha" } });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: "Beta" } });
  expect(screen.queryByRole("option")).toBeNull();
  await screen.findByRole("option", { name: /Marie Beta/ });
  await act(async () => resolveFirst(json([patients[0]])));
  expect(screen.queryByRole("option", { name: /Marie Alpha/ })).toBeNull();
  expect(screen.getByRole("option", { name: /Marie Beta/ })).toBeTruthy();
  fireEvent.change(input, { target: { value: "" } });
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(screen.queryByText("Marie Beta")).toBeNull();
});

it("closes search suggestions with Escape before closing the booking dialog", async () => {
  const t = translations.fr.appointments,
    user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("/doctors")
        ? new Response(JSON.stringify({ items: [] }))
        : json(patients),
    ),
  );
  renderPatient(<BookingAction lang="fr" canWrite onExpired={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: t.book }));
  const input = screen.getByRole("combobox", { name: t.patientSearch });
  await user.type(input, "Marie");
  await screen.findByRole("option", { name: /Marie Alpha/ });
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.queryByRole("listbox")).toBeNull();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
