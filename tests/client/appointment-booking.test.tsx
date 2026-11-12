// @vitest-environment jsdom
import "./ui-browser-apis";
import { afterEach, it, expect, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPatient } from "./render-patient";
import { BookingAction } from "../../client/features/appointments";
import { translations } from "../../client/shared/i18n";
const bookingText = {
  ar: translations.ar.appointments,
  fr: translations.fr.appointments,
};

const patient = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Patient fixture",
  fileNumber: "17",
  archived: false,
};
const doctor = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Doctor fixture",
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function transport(
  outcome: (body: any) => Promise<Response> = async (body) =>
    new Response(
      JSON.stringify({
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        patientId: body.patientId,
        doctorId: body.doctorId,
        startsAt: `${body.date}T${body.time}:00.000Z`,
        endsAt: `${body.date}T10:30:00.000Z`,
        status: "booked",
        editVersion: 1,
      }),
      { status: 201 },
    ),
) {
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) =>
    options?.method === "POST"
      ? outcome(JSON.parse(String(options.body)))
      : new Response(JSON.stringify({ items: [doctor] })),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
async function fill(lang: "ar" | "fr" = "fr") {
  const t = bookingText[lang],
    user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: t.book }));
  await waitFor(() =>
    expect(screen.getByRole("combobox").getAttribute("disabled")).toBeNull(),
  );
  await waitFor(() => expect(screen.queryByText(t.loading)).toBeNull());
  screen.getByRole("combobox").focus();
  await user.keyboard("{Enter}{End}{Enter}");
  fireEvent.change(screen.getByLabelText(t.date), {
    target: { value: "2090-01-01" },
  });
  fireEvent.change(screen.getByLabelText(t.time), {
    target: { value: "10:00" },
  });
  expect(screen.getByLabelText(t.time).getAttribute("type")).toBe("time");
  expect(screen.getByLabelText(t.time).getAttribute("dir")).toBe("ltr");
  fireEvent.change(screen.getByLabelText(t.note), {
    target: { value: "Keep this draft" },
  });
  return user;
}
it.each(["ar", "fr"] as const)(
  "confirms booking only after the complete 201 contract in %s and restores focus",
  async (lang) => {
    const fetcher = transport();
    const t = bookingText[lang];
    renderPatient(
      <BookingAction
        patient={patient}
        lang={lang}
        canWrite
        onExpired={() => {}}
      />,
    );
    const user = await fill(lang);
    expect(screen.getByRole("dialog").getAttribute("dir")).toBe(
      lang === "ar" ? "rtl" : "ltr",
    );
    await user.click(screen.getByRole("button", { name: t.save }));
    expect((await screen.findByRole("status")).textContent).toBe(t.saved);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: t.book }),
    );
    expect(
      fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(1);
  },
);
it.each(["ar", "fr"] as const)(
  "preserves conflict draft and guards Escape and navigation in %s",
  async (lang) => {
    transport(
      async () =>
        new Response(JSON.stringify({ error: "appointment_overlap" }), {
          status: 409,
        }),
    );
    let guard: ((leave: () => void, stay?: () => void) => void) | null = null;
    const t = bookingText[lang];
    renderPatient(
      <BookingAction
        patient={patient}
        lang={lang}
        canWrite
        onExpired={() => {}}
        onNavigationGuardChange={(value) => {
          guard = value;
        }}
      />,
    );
    const user = await fill(lang);
    await user.click(screen.getByRole("button", { name: t.save }));
    expect((await screen.findByRole("alert")).textContent).toBe(t.overlap);
    expect((screen.getByLabelText(t.note) as HTMLTextAreaElement).value).toBe(
      "Keep this draft",
    );
    await user.keyboard("{Escape}");
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: t.stay }));
    const leave = vi.fn();
    act(() => guard!(leave));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: t.discard }));
    expect(leave).toHaveBeenCalledOnce();
  },
);
it.each(["lost", "malformed", "server"] as const)(
  "blocks another submission for %s outcome without retrying",
  async (failure) => {
    const fetcher = transport(async () => {
      if (failure === "lost") throw new TypeError("offline after commit");
      return failure === "server"
        ? new Response("{}", { status: 500 })
        : new Response(JSON.stringify({ id: "incomplete" }), { status: 201 });
    });
    renderPatient(
      <BookingAction
        patient={patient}
        lang="fr"
        canWrite
        onExpired={() => {}}
      />,
    );
    const user = await fill();
    await user.click(screen.getByRole("button", { name: bookingText.fr.save }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      bookingText.fr.uncertain,
    );
    fireEvent.submit(
      screen.getByLabelText(bookingText.fr.note).closest("form")!,
    );
    await user.click(
      screen.getByRole("button", { name: bookingText.fr.retry }),
    );
    expect(
      fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(1);
    expect(
      (
        screen.getByRole("button", {
          name: bookingText.fr.save,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  },
);
it("prevents double submit while pending, preserves offline draft, and applies write revocation", async () => {
  let finish!: (response: Response) => void;
  const fetcher = transport(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { rerender } = renderPatient(
    <BookingAction patient={patient} lang="fr" canWrite onExpired={() => {}} />,
  );
  const user = await fill();
  const form = screen.getByLabelText(bookingText.fr.note).closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(1),
  );
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("alertdialog")).toBeNull();
  finish(new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }));
  await screen.findByRole("alert");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  fireEvent(window, new Event("offline"));
  expect(
    (screen.getByLabelText(bookingText.fr.note) as HTMLTextAreaElement).value,
  ).toBe("Keep this draft");
  expect(
    (
      screen.getByRole("button", {
        name: bookingText.fr.save,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  rerender(
    <BookingAction
      patient={patient}
      lang="fr"
      canWrite={false}
      onExpired={() => {}}
    />,
  );
  fireEvent.submit(form);
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
  ).toHaveLength(1);
});
it("does not expose the action without write and disables it for an archived patient", () => {
  const fetcher = transport();
  const { rerender } = renderPatient(
    <BookingAction
      patient={patient}
      lang="ar"
      canWrite={false}
      onExpired={() => {}}
    />,
  );
  expect(screen.queryByRole("button")).toBeNull();
  rerender(
    <BookingAction
      patient={{ ...patient, archived: true }}
      lang="ar"
      canWrite
      onExpired={() => {}}
    />,
  );
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
});
